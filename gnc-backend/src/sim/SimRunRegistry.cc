// gnc-backend/src/sim/SimRunRegistry.cc

#include "SimRunRegistry.h"

#include "gnc-core/logging/DataLogger.h"
#include <iostream>
#include <chrono>
#include <thread>
#include <vector>
#include <nlohmann/json.hpp>

#include <random>
#include <sstream>
#include <fstream>
#include <yaml-cpp/yaml.h>

namespace gnc::backend::sim {

namespace {

#pragma pack(push, 1)
struct BinarySimFrame {
    float time;
    float altitude;
    float velocity;
    float mach;
    float q;
    float pitch;
    float yaw;
    float roll;
    float pos_x;
    float pos_y;
    uint8_t phase;
    uint8_t currentStage;
    float act0;
    float act1;
    float act2;
    float act3;
    uint16_t saturationBitmask;
    float latitude;
    float longitude;
};
#pragma pack(pop)

static_assert(sizeof(BinarySimFrame) == 68, "BinarySimFrame must be exactly 68 bytes");

std::string frame_to_binary(const gnc::sim::SimFrame& f)
{
    BinarySimFrame bf{};
    bf.time = static_cast<float>(f.t_s);
    bf.altitude = static_cast<float>(f.altitude_msl_m);
    bf.velocity = static_cast<float>(f.speed_m_s);
    bf.mach = static_cast<float>(f.log_row.mach);
    bf.q = static_cast<float>(f.log_row.q_dynamic_Pa);
    bf.pitch = static_cast<float>(f.pitch_deg);
    bf.yaw = static_cast<float>(f.yaw_deg);
    bf.roll = static_cast<float>(f.roll_deg);
    bf.pos_x = static_cast<float>(f.r_n.x);
    bf.pos_y = static_cast<float>(f.r_n.y);
    bf.phase = static_cast<uint8_t>(f.phase);
    bf.currentStage = 0; // single stage for now
    bf.act0 = static_cast<float>(f.control_output);
    bf.act1 = 0.0f;
    bf.act2 = 0.0f;
    bf.act3 = 0.0f;
    bf.saturationBitmask = 0;
    bf.latitude = static_cast<float>(f.lat_deg);
    bf.longitude = static_cast<float>(f.lon_deg);

    return std::string(reinterpret_cast<const char*>(&bf), sizeof(BinarySimFrame));
}

}  // namespace

// ===========================================================================
// SimRun
// ===========================================================================
SimRun::SimRun(std::string id, gnc::sim::SimConfig cfg, const nlohmann::json& mission_json)
    : id_(std::move(id))
    , cfg_(cfg)
    , sim_(std::move(cfg), cfg.sim_mode)
    , sequencer_(mission_json)
{}

void SimRun::updateTuningParams(const gnc::TuningParams& params)
{
    sim_.updateTuningParams(params);
}

SimRun::~SimRun()
{
    stop_requested_ = true;
    if (worker_.joinable()) worker_.join();
}

void SimRun::start()
{
    worker_ = std::thread(&SimRun::run_loop, this);
}

void SimRun::stop()
{
    stop_requested_ = true;
}

void SimRun::attach(drogon::WebSocketConnectionPtr conn)
{
    std::lock_guard<std::mutex> lock(subs_mu_);
    subs_.insert(std::move(conn));
}

void SimRun::detach(const drogon::WebSocketConnectionPtr& conn)
{
    std::lock_guard<std::mutex> lock(subs_mu_);
    subs_.erase(conn);
}

std::size_t SimRun::subscriber_count() const
{
    std::lock_guard<std::mutex> lock(subs_mu_);
    return subs_.size();
}

void SimRun::broadcast(const std::string& payload, drogon::WebSocketMessageType type)
{
    std::lock_guard<std::mutex> lock(subs_mu_);
    for (auto it = subs_.begin(); it != subs_.end(); ) {
        const auto& c = *it;
        if (c && c->connected()) {
            c->send(payload, type);
            ++it;
        } else {
            it = subs_.erase(it);
        }
    }
}

void SimRun::run_loop()
{
    using clock = std::chrono::steady_clock;

    // Fast-Forward Compute Phase
    std::string log_file = "logs/sim_run_" + id_ + ".csv";
    gnc::logging::DataLogger logger(log_file);
    
    struct ReplayFrame {
        std::string binary_frame;
        std::string tele_ext;
    };
    std::vector<ReplayFrame> replay_buffer;
    replay_buffer.reserve(10000); // Reserve memory

    while (!stop_requested_.load()) {
        auto frame = sim_.step();

        try {
            sequencer_.step(frame, sim_);
        } catch (const std::exception& e) {
            std::cerr << "Simulation aborted: " << e.what() << "\n";
            frame.finished = true;
        }

        nlohmann::json tele_ext;
        if (sequencer_.is_active()) {
            tele_ext["active_phase"] = sequencer_.current_phase_name();
        }

        // Save to data logger natively
        logger.logRow(frame.log_row);
        
        // Save for replay
        ReplayFrame rf;
        rf.binary_frame = frame_to_binary(frame);
        if (sequencer_.is_active()) {
            rf.tele_ext = tele_ext.dump();
        }
        replay_buffer.push_back(std::move(rf));

        if (frame.finished) break;
    }
    logger.close();

    // Replay Phase to WebSocket Clients in batches of 100
    constexpr size_t BATCH_SIZE = 100;
    for (size_t i = 0; i < replay_buffer.size(); ++i) {
        if (stop_requested_.load()) break;

        broadcast(replay_buffer[i].binary_frame, drogon::WebSocketMessageType::Binary);
        if (!replay_buffer[i].tele_ext.empty()) {
            broadcast(replay_buffer[i].tele_ext, drogon::WebSocketMessageType::Text);
        }

        // Sleep for 10ms every 100 frames to let the browser event loop breathe
        if ((i + 1) % BATCH_SIZE == 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }

    // Closing message — FE listens for this to stop drawing.
    auto last = sim_.current();
    nlohmann::json done = {
        {"type",     "sim_done"},
        {"runId",    id_},
        {"reason",   stop_requested_.load() ? "stopped" : "completed"},
        {"final_t",  last.t_s},
        {"final_alt_msl_m", last.altitude_msl_m}
    };
    broadcast(done.dump(), drogon::WebSocketMessageType::Text);

    finished_ = true;
}

// ===========================================================================
// SimRunRegistry
// ===========================================================================
SimRunRegistry& SimRunRegistry::instance()
{
    static SimRunRegistry inst;
    return inst;
}

std::string SimRunRegistry::new_id()
{
    static std::mt19937_64 rng{std::random_device{}()};
    std::stringstream ss;
    ss << "run_" << std::hex << rng();
    return ss.str();
}

std::string SimRunRegistry::start(gnc::sim::SimConfig cfg, const nlohmann::json& mission_json)
{
    std::string id = new_id();
    auto run = std::make_shared<SimRun>(id, std::move(cfg), mission_json);
    {
        std::lock_guard<std::mutex> lock(mu_);
        runs_.emplace(id, run);
    }
    run->start();
    return id;
}

bool SimRunRegistry::stop(const std::string& runId)
{
    std::shared_ptr<SimRun> run;
    {
        std::lock_guard<std::mutex> lock(mu_);
        auto it = runs_.find(runId);
        if (it == runs_.end()) return false;
        run = it->second;
    }
    run->stop();
    return true;
}

bool SimRunRegistry::updateTuningParams(const std::string& runId, const gnc::TuningParams& params)
{
    std::shared_ptr<SimRun> run;
    {
        std::lock_guard<std::mutex> lock(mu_);
        auto it = runs_.find(runId);
        if (it == runs_.end()) return false;
        run = it->second;
    }
    run->updateTuningParams(params);
    return true;
}

bool SimRunRegistry::attach(const std::string& runId,
                            drogon::WebSocketConnectionPtr conn)
{
    std::shared_ptr<SimRun> run;
    {
        std::lock_guard<std::mutex> lock(mu_);
        auto it = runs_.find(runId);
        if (it == runs_.end()) return false;
        run = it->second;
    }
    run->attach(std::move(conn));
    return true;
}

void SimRunRegistry::detach(const std::string& runId,
                            const drogon::WebSocketConnectionPtr& conn)
{
    std::shared_ptr<SimRun> run;
    {
        std::lock_guard<std::mutex> lock(mu_);
        auto it = runs_.find(runId);
        if (it == runs_.end()) return;
        run = it->second;
    }
    run->detach(conn);
}

bool SimRunRegistry::exists(const std::string& runId) const
{
    std::lock_guard<std::mutex> lock(mu_);
    return runs_.count(runId) > 0;
}

void SimRunRegistry::load_rocket_cache(const std::string& template_id)
{
    std::lock_guard<std::mutex> lock(cache_mu_);
    if (rocket_cache_.count(template_id) > 0) return; // Already loaded

    RocketCache cache;
    cache.atmosphere_table = std::make_shared<gnc::sim::AtmosphereTable>();
    cache.thrust_curve = std::make_shared<gnc::sim::ThrustCurve>();
    cache.aero_coeffs = std::make_shared<gnc::sim::AeroCoeffs>();
    cache.aero_coeffs_motor_on = std::make_shared<gnc::sim::AeroCoeffs>();
    cache.aero_coeffs_motor_off = std::make_shared<gnc::sim::AeroCoeffs>();
    cache.damping_coeffs = std::make_shared<gnc::sim::DampingCoeffs>();
    cache.fin_deflection_coeffs = std::make_shared<gnc::sim::FinDeflectionCoeffs>();
    cache.roll_aero_coeffs = std::make_shared<gnc::sim::RollAeroCoeffs>();

    // Load tables. Assuming working directory is the project root.
    // Try both project root and relative to build dir just in case.
    std::vector<std::string> atmo_paths = {
        "rockets/" + template_id + "/atmosphere_table.csv",
        "../rockets/" + template_id + "/atmosphere_table.csv",
        "../../rockets/" + template_id + "/atmosphere_table.csv",
        "../../../rockets/" + template_id + "/atmosphere_table.csv",
        "atmosphere_table.csv",
        "../atmosphere_table.csv",
        "../../atmosphere_table.csv",
        "../../../atmosphere_table.csv"
    };
    for (const auto& p : atmo_paths) {
        cache.atmosphere_table->loadFromCsv(p);
        if (cache.atmosphere_table->isLoaded()) break;
    }

    std::vector<std::string> thrust_paths = {"rockets/" + template_id + "/thrust_curve.csv", "../rockets/" + template_id + "/thrust_curve.csv", "../../rockets/" + template_id + "/thrust_curve.csv", "../../../rockets/" + template_id + "/thrust_curve.csv"};
    for (const auto& p : thrust_paths) {
        cache.thrust_curve->loadFromCsv(p);
        if (cache.thrust_curve->isLoaded()) {
            std::ifstream file(p);
            std::string line, last_line;
            while(std::getline(file, line)) {
                if(!line.empty()) last_line = line;
            }
            try {
                auto pos = last_line.find(',');
                if (pos != std::string::npos) {
                    cache.burn_time_s = std::stod(last_line.substr(0, pos));
                }
            } catch (...) {}
            break;
        }
    }

    std::vector<std::string> aero_paths = {
        "rockets/" + template_id + "/ca_3d_coeffs_motor_off.csv",
        "../rockets/" + template_id + "/ca_3d_coeffs_motor_off.csv",
        "../../rockets/" + template_id + "/ca_3d_coeffs_motor_off.csv",
        "../../../rockets/" + template_id + "/ca_3d_coeffs_motor_off.csv",
        "rockets/" + template_id + "/aero_coeffs.csv", 
        "../rockets/" + template_id + "/aero_coeffs.csv", 
        "../../rockets/" + template_id + "/aero_coeffs.csv", 
        "../../../rockets/" + template_id + "/aero_coeffs.csv"
    };
    for (const auto& p : aero_paths) {
        cache.aero_coeffs->loadFromCsv(p);
        if (cache.aero_coeffs->isLoaded()) break;
    }

    std::vector<std::string> aero_on_paths = {
        "rockets/" + template_id + "/ca_3d_coeffs_motor_on.csv",
        "../rockets/" + template_id + "/ca_3d_coeffs_motor_on.csv",
        "../../rockets/" + template_id + "/ca_3d_coeffs_motor_on.csv",
        "../../../rockets/" + template_id + "/ca_3d_coeffs_motor_on.csv",
        "rockets/" + template_id + "/aero_coeffs.csv", 
        "../rockets/" + template_id + "/aero_coeffs.csv", 
        "../../rockets/" + template_id + "/aero_coeffs.csv", 
        "../../../rockets/" + template_id + "/aero_coeffs.csv"
    };
    for (const auto& p : aero_on_paths) {
        cache.aero_coeffs_motor_on->loadFromCsv(p);
        if (cache.aero_coeffs_motor_on->isLoaded()) break;
    }

    std::vector<std::string> aero_off_paths = {
        "rockets/" + template_id + "/ca_3d_coeffs_motor_off.csv",
        "../rockets/" + template_id + "/ca_3d_coeffs_motor_off.csv",
        "../../rockets/" + template_id + "/ca_3d_coeffs_motor_off.csv",
        "../../../rockets/" + template_id + "/ca_3d_coeffs_motor_off.csv",
        "rockets/" + template_id + "/aero_coeffs.csv", 
        "../rockets/" + template_id + "/aero_coeffs.csv", 
        "../../rockets/" + template_id + "/aero_coeffs.csv", 
        "../../../rockets/" + template_id + "/aero_coeffs.csv"
    };
    for (const auto& p : aero_off_paths) {
        cache.aero_coeffs_motor_off->loadFromCsv(p);
        if (cache.aero_coeffs_motor_off->isLoaded()) break;
    }

    std::vector<std::string> damp_paths = {
        "rockets/" + template_id + "/damping_coeffs.csv",
        "../rockets/" + template_id + "/damping_coeffs.csv",
        "../../rockets/" + template_id + "/damping_coeffs.csv",
        "../../../rockets/" + template_id + "/damping_coeffs.csv"
    };
    for (const auto& p : damp_paths) {
        cache.damping_coeffs->loadFromCsv(p);
        if (cache.damping_coeffs->isLoaded()) break;
    }

    std::vector<std::string> fin_paths = {
        "rockets/" + template_id + "/fin_deflection_coeffs.csv",
        "../rockets/" + template_id + "/fin_deflection_coeffs.csv",
        "../../rockets/" + template_id + "/fin_deflection_coeffs.csv",
        "../../../rockets/" + template_id + "/fin_deflection_coeffs.csv"
    };
    for (const auto& p : fin_paths) {
        cache.fin_deflection_coeffs->loadFromCsv(p);
        if (cache.fin_deflection_coeffs->isLoaded()) break;
    }

    std::vector<std::string> roll_paths = {
        "rockets/" + template_id + "/roll_aero_coeffs.csv",
        "../rockets/" + template_id + "/roll_aero_coeffs.csv",
        "../../rockets/" + template_id + "/roll_aero_coeffs.csv",
        "../../../rockets/" + template_id + "/roll_aero_coeffs.csv"
    };
    for (const auto& p : roll_paths) {
        cache.roll_aero_coeffs->loadFromCsv(p);
        if (cache.roll_aero_coeffs->isLoaded()) break;
    }

    // ensure burn time is captured regardless
    cache.has_config = true; // FORCE true to at least get burn time

    rocket_cache_[template_id] = cache;
}

SimRunRegistry::RocketCache SimRunRegistry::get_rocket_cache(const std::string& template_id) const
{
    std::lock_guard<std::mutex> lock(cache_mu_);
    auto it = rocket_cache_.find(template_id);
    if (it != rocket_cache_.end()) return it->second;
    return {};
}

void SimRunRegistry::gc()
{
    std::lock_guard<std::mutex> lock(mu_);
    for (auto it = runs_.begin(); it != runs_.end(); ) {
        if (it->second->finished() && it->second->subscriber_count() == 0) {
            it = runs_.erase(it);
        } else {
            ++it;
        }
    }
}

}  // namespace gnc::backend::sim
