// gnc-backend/src/controllers/SimulationController.cc
// start: parses an optional JSON body that overrides the default SimConfig,
//        spawns a SimRun in the registry, returns runId + ws_url.
// stop:  signals the run to abort. Subscribers receive a final sim_done.
//
// The full pipeline (mission YAML → schedule of stages → multi-stage sim)
// lands in Stream C.2; for now we accept either:
//   • {} — fires a "ballistic check" run with safe defaults, OR
//   • {sim: {...}} — direct override of any SimConfig field.

#include "SimulationController.h"
#include "../sim/SimRunRegistry.h"
#include "gnc-core/control/ControllerFactory.h"

#include <nlohmann/json.hpp>
#include <yaml-cpp/yaml.h>
#include <filesystem>

namespace gnc::backend {

namespace {

drogon::HttpResponsePtr json_response(nlohmann::json body,
                                      drogon::HttpStatusCode code = drogon::k200OK)
{
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(code);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(body.dump());
    return resp;
}

gnc::Vec3 vec3_from(const nlohmann::json& j, const gnc::Vec3& fb)
{
    if (j.is_array() && j.size() == 3) {
        return { j[0].get<double>(), j[1].get<double>(), j[2].get<double>() };
    }
    return fb;
}

gnc::sim::SimConfig parse_sim_config(const nlohmann::json& body)
{
    // Default: 70 kg dry, 100 kg wet, 5 kN thrust for 4 s, Cd*A = 0.05.
    // Apex around ~1500 m for a vertical launch — good smoke-test range.
    gnc::sim::SimConfig cfg;
    cfg.mass_init_kg = 100.0;
    cfg.mass_dry_kg  = 70.0;
    cfg.thrust_N     = 5000.0;
    cfg.burn_time_s  = 4.0;
    cfg.cd_A_m2      = 0.05;
    cfg.dt_s         = 0.01;
    cfg.t_end_s      = 120.0;

    if (!body.is_object() || !body.contains("sim") || !body["sim"].is_object()) {
        return cfg;
    }
    const auto& s = body["sim"];

    
    if (s.contains("initial_conditions") && s["initial_conditions"].is_object()) {
        auto ic = s["initial_conditions"];
        if (ic.contains("position")) cfg.r0_n = vec3_from(ic["position"], cfg.r0_n);
        if (ic.contains("velocity")) cfg.v0_n = vec3_from(ic["velocity"], cfg.v0_n);
        if (ic.contains("attitude") && ic["attitude"].is_array() && ic["attitude"].size() == 4) {
            cfg.q0_b_n.w = ic["attitude"][0].get<double>();
            cfg.q0_b_n.x = ic["attitude"][1].get<double>();
            cfg.q0_b_n.y = ic["attitude"][2].get<double>();
            cfg.q0_b_n.z = ic["attitude"][3].get<double>();
        }
    }

    if (s.contains("launch") && s["launch"].is_object()) {
        auto ln = s["launch"];
        if (ln.contains("latitude")) cfg.earth_params.launch_latitude_deg = ln["latitude"].get<double>();
        if (ln.contains("longitude")) cfg.earth_params.launch_longitude_deg = ln["longitude"].get<double>();
        if (ln.contains("altitude")) cfg.ground_alt_m = ln["altitude"].get<double>();
    }

    if (s.contains("thrust_N"))     cfg.thrust_N     = s["thrust_N"].get<double>();
    if (s.contains("burn_time_s"))  cfg.burn_time_s  = s["burn_time_s"].get<double>();
    if (s.contains("mass_init_kg")) cfg.mass_init_kg = s["mass_init_kg"].get<double>();
    if (s.contains("mass_dry_kg"))  cfg.mass_dry_kg  = s["mass_dry_kg"].get<double>();
    if (s.contains("cd_A_m2"))      cfg.cd_A_m2      = s["cd_A_m2"].get<double>();
    if (s.contains("S_ref_m2"))     cfg.full.S_ref_m2 = s["S_ref_m2"].get<double>();
    if (s.contains("rho_kg_m3"))    cfg.rho_kg_m3    = s["rho_kg_m3"].get<double>();
    if (s.contains("gravity_m_s2")) cfg.gravity_m_s2 = s["gravity_m_s2"].get<double>();
    if (s.contains("ground_alt_m")) cfg.ground_alt_m = s["ground_alt_m"].get<double>();
    if (s.contains("dt_s"))         cfg.dt_s         = s["dt_s"].get<double>();
    if (s.contains("t_end_s"))      cfg.t_end_s      = s["t_end_s"].get<double>();
    if (s.contains("use_ecef"))     cfg.use_ecef     = s["use_ecef"].get<bool>();
    if (s.contains("sim_mode")) {
        std::string mode_str = s["sim_mode"].get<std::string>();
        if (mode_str == "tuning") cfg.sim_mode = gnc::sim::Mode::Tuning;
        else if (mode_str == "full") cfg.sim_mode = gnc::sim::Mode::Full;
        else cfg.sim_mode = gnc::sim::Mode::ThreeDOF;
    }
    
    if (s.contains("tuning") && s["tuning"].is_object()) {
        auto t = s["tuning"];
        if (t.contains("pid_gains") && t["pid_gains"].is_object()) {
            auto p = t["pid_gains"];
            if (p.contains("algorithm")) cfg.tuning.pid_gains.algorithm = p["algorithm"].get<std::string>();
            if (p.contains("controller_type")) cfg.tuning.pid_gains.controller_type = p["controller_type"].get<std::string>();
            if (p.contains("kp")) cfg.tuning.pid_gains.kp = p["kp"].get<double>();
            if (p.contains("ki")) cfg.tuning.pid_gains.ki = p["ki"].get<double>();
            if (p.contains("kd")) cfg.tuning.pid_gains.kd = p["kd"].get<double>();
            if (p.contains("Q")) cfg.tuning.pid_gains.Q = p["Q"].get<std::vector<double>>();
            if (p.contains("R")) cfg.tuning.pid_gains.R = p["R"].get<std::vector<double>>();
            if (p.contains("K")) cfg.tuning.pid_gains.K = p["K"].get<std::vector<double>>();
        }
    }

    cfg.controller = nullptr;
    cfg.allocator = nullptr;

    return cfg;
}

}  // namespace

void SimulationController::start(const drogon::HttpRequestPtr& req, Cb&& cb)
{
    nlohmann::json body = nlohmann::json::object();
    try {
        if (!req->body().empty()) body = nlohmann::json::parse(req->body());
    } catch (const std::exception& e) {
        return cb(json_response({{"error", "invalid-json"},
                                 {"details", e.what()}},
                                drogon::k400BadRequest));
    }

    auto cfg    = parse_sim_config(body);
    
    std::string template_id = body.value("template_id", "BA"); // Default to BA if not provided
    sim::SimRunRegistry::instance().load_rocket_cache(template_id);
    auto cache = sim::SimRunRegistry::instance().get_rocket_cache(template_id);
    cfg.atmosphere_table = cache.atmosphere_table;
    cfg.thrust_curve = cache.thrust_curve;
    cfg.aero_coeffs = cache.aero_coeffs;
    cfg.aero_coeffs_motor_on = cache.aero_coeffs_motor_on;
    cfg.aero_coeffs_motor_off = cache.aero_coeffs_motor_off;
    cfg.damping_coeffs = cache.damping_coeffs;
    cfg.fin_deflection_coeffs = cache.fin_deflection_coeffs;
    cfg.roll_aero_coeffs = cache.roll_aero_coeffs;
    if (cache.has_config) {
        if (cache.burn_time_s > 0) cfg.burn_time_s = cache.burn_time_s;
    }
    cfg.fin_delta_max_deg = cache.fin_delta_max_deg;
    cfg.fin_rate_max_deg_s = cache.fin_rate_max_deg_s;

    // Load physical properties from rocket_properties.yaml
    std::string prop_path = "";
    std::vector<std::string> prop_paths = {
        "rockets/" + template_id + "/rocket_properties.yaml",
        "../rockets/" + template_id + "/rocket_properties.yaml",
        "../../rockets/" + template_id + "/rocket_properties.yaml",
        "../../../rockets/" + template_id + "/rocket_properties.yaml"
    };
    for (const auto& p : prop_paths) {
        if (std::filesystem::exists(p)) {
            prop_path = p;
            break;
        }
    }
    if (!prop_path.empty()) {
        try {
            YAML::Node doc = YAML::LoadFile(prop_path);
            if (doc["stages"] && doc["stages"].IsSequence() && doc["stages"].size() > 0) {
                auto stage = doc["stages"][0];
                if (stage["physical"]) {
                    auto phys = stage["physical"];
                    if (phys["cg_dry_body_m"] && phys["cg_dry_body_m"].IsSequence() && phys["cg_dry_body_m"].size() == 3) {
                        cfg.full.cg_dry_m.x = 0.0;
                        cfg.full.cg_dry_m.y = 0.0;
                        cfg.full.cg_dry_m.z = -phys["cg_dry_body_m"][0].as<double>();
                    }
                    if (phys["cg_full_body_m"] && phys["cg_full_body_m"].IsSequence() && phys["cg_full_body_m"].size() == 3) {
                        cfg.full.cg_wet_m.x = 0.0;
                        cfg.full.cg_wet_m.y = 0.0;
                        cfg.full.cg_wet_m.z = -phys["cg_full_body_m"][0].as<double>();
                    }
                    if (phys["inertia_dry_kgm2"] && phys["inertia_dry_kgm2"].IsSequence() && phys["inertia_dry_kgm2"].size() == 3) {
                        cfg.full.inertia_dry.m[0][0] = phys["inertia_dry_kgm2"][1].as<double>(); // pitch
                        cfg.full.inertia_dry.m[1][1] = phys["inertia_dry_kgm2"][2].as<double>(); // yaw
                        cfg.full.inertia_dry.m[2][2] = phys["inertia_dry_kgm2"][0].as<double>(); // roll
                    }
                    if (phys["inertia_full_kgm2"] && phys["inertia_full_kgm2"].IsSequence() && phys["inertia_full_kgm2"].size() == 3) {
                        cfg.full.inertia_wet.m[0][0] = phys["inertia_full_kgm2"][1].as<double>(); // pitch
                        cfg.full.inertia_wet.m[1][1] = phys["inertia_full_kgm2"][2].as<double>(); // yaw
                        cfg.full.inertia_wet.m[2][2] = phys["inertia_full_kgm2"][0].as<double>(); // roll
                    }
                }
                if (stage["geometry"]) {
                    auto geom = stage["geometry"];
                    if (geom["ref_area_m2"]) {
                        cfg.full.S_ref_m2 = geom["ref_area_m2"].as<double>();
                    }
                    if (geom["ref_length_m"]) {
                        cfg.full.L_ref_m = geom["ref_length_m"].as<double>();
                    }
                }
                if (stage["actuators"]) {
                    auto act = stage["actuators"];
                    if (act["delta_max_deg"]) {
                        cfg.fin_delta_max_deg = act["delta_max_deg"].as<double>();
                    }
                    if (act["delta_dot_max_deg_s"]) {
                        cfg.fin_rate_max_deg_s = act["delta_dot_max_deg_s"].as<double>();
                    }
                }
            }
        } catch (...) {
            // Ignore error
        }
    }

    auto run_id = sim::SimRunRegistry::instance().start(cfg, body);

    cb(json_response({
        {"runId",  run_id},
        {"ws_url", "/ws/simulation/" + run_id},
        {"config", {
            {"thrust_N",     cfg.thrust_N},
            {"burn_time_s",  cfg.burn_time_s},
            {"mass_init_kg", cfg.mass_init_kg},
            {"mass_dry_kg",  cfg.mass_dry_kg},
            {"cd_A_m2",      cfg.cd_A_m2},
            {"dt_s",         cfg.dt_s},
            {"t_end_s",      cfg.t_end_s}
        }}
    }));
}

void SimulationController::stop(const drogon::HttpRequestPtr&, Cb&& cb,
                                std::string runId)
{
    bool ok = sim::SimRunRegistry::instance().stop(runId);
    if (!ok) {
        return cb(json_response({{"error", "run-not-found"},
                                 {"runId", runId}},
                                drogon::k404NotFound));
    }
    cb(json_response({{"runId", runId}, {"stopped", true}}));
}

void SimulationController::load_rocket(const drogon::HttpRequestPtr& req, Cb&& cb)
{
    nlohmann::json body = nlohmann::json::object();
    try {
        if (!req->body().empty()) body = nlohmann::json::parse(req->body());
    } catch (const std::exception& e) {
        return cb(json_response({{"error", "invalid-json"}, {"details", e.what()}}, drogon::k400BadRequest));
    }

    std::string template_id = body.value("template_id", "");
    if (template_id.empty()) {
        return cb(json_response({{"error", "missing-template-id"}}, drogon::k400BadRequest));
    }

    // Load and parse CSVs into memory cache
    sim::SimRunRegistry::instance().load_rocket_cache(template_id);

    cb(json_response({{"status", "loaded"}, {"template_id", template_id}}));
}

void SimulationController::update_params(const drogon::HttpRequestPtr& req, Cb&& cb, std::string runId)
{
    nlohmann::json body = nlohmann::json::object();
    try {
        if (!req->body().empty()) body = nlohmann::json::parse(req->body());
    } catch (const std::exception& e) {
        return cb(json_response({{"error", "invalid-json"}, {"details", e.what()}}, drogon::k400BadRequest));
    }

    gnc::TuningParams params;
    if (body.contains("algorithm")) params.algorithm = body["algorithm"].get<std::string>();
    if (body.contains("controller_type")) params.controller_type = body["controller_type"].get<std::string>();
    if (body.contains("kp")) params.kp = body["kp"].get<double>();
    if (body.contains("ki")) params.ki = body["ki"].get<double>();
    if (body.contains("kd")) params.kd = body["kd"].get<double>();
    if (body.contains("Q")) params.Q = body["Q"].get<std::vector<double>>();
    if (body.contains("R")) params.R = body["R"].get<std::vector<double>>();
    if (body.contains("K")) params.K = body["K"].get<std::vector<double>>();

    bool ok = sim::SimRunRegistry::instance().updateTuningParams(runId, params);
    if (!ok) {
        return cb(json_response({{"error", "run-not-found"}, {"runId", runId}}, drogon::k404NotFound));
    }
    cb(json_response({{"runId", runId}, {"updated", true}}));
}

void SimulationController::download_log(const drogon::HttpRequestPtr& req, Cb&& cb, std::string runId)
{
    std::string filepath = "logs/sim_run_" + runId + ".csv";
    auto resp = drogon::HttpResponse::newFileResponse(filepath, "", drogon::CT_TEXT_PLAIN);
    if (!resp) {
        return cb(json_response({{"error", "log-not-found"}, {"runId", runId}}, drogon::k404NotFound));
    }
    resp->addHeader("Content-Disposition", "attachment; filename=\"sim_run_" + runId + ".csv\"");
    cb(resp);
}

}  // namespace gnc::backend
