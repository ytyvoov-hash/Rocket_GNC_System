// gnc-backend/src/sim/SimRunRegistry.h
// Singleton that owns every active simulation run. The Simulation REST
// controller calls start()/stop(), and the /ws/simulation/{runId} controller
// calls attach()/detach() to subscribe a WebSocket connection to a run's
// frame stream.
//
// Threading model:
//   - Each run owns one std::thread that drives the integrator and pushes
//     JSON frames at SimConfig.dt_s wall-clock cadence.
//   - The list of subscribers per run is guarded by a per-run mutex.
//   - The registry map itself is guarded by a single registry mutex.

#pragma once

#include <drogon/WebSocketConnection.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <unordered_map>

#include "gnc-core/sim/UnifiedSim.h"
#include "MissionSequencer.h"
namespace gnc::backend::sim {

class SimRun {
public:
    SimRun(std::string id, gnc::sim::SimConfig cfg, const nlohmann::json& mission_json = nullptr);
    ~SimRun();

    SimRun(const SimRun&)            = delete;
    SimRun& operator=(const SimRun&) = delete;

    void start();
    void stop();
    void attach(drogon::WebSocketConnectionPtr conn);
    void detach(const drogon::WebSocketConnectionPtr& conn);
    void updateTuningParams(const gnc::TuningParams& params);

    const std::string& id() const { return id_; }
    bool finished() const { return finished_.load(); }
    std::size_t subscriber_count() const;

private:
    void run_loop();
    void broadcast(const std::string& payload, drogon::WebSocketMessageType type = drogon::WebSocketMessageType::Text);

    std::string                                id_;
    gnc::sim::SimConfig                        cfg_;
    gnc::sim::UnifiedSim                       sim_;
    MissionSequencer                           sequencer_;
    std::thread                                worker_;
    std::atomic<bool>                          stop_requested_{false};
    std::atomic<bool>                          finished_{false};

    mutable std::mutex                         subs_mu_;
    std::set<drogon::WebSocketConnectionPtr>   subs_;
};

class SimRunRegistry {
public:
    static SimRunRegistry& instance();

    // Spawns a new run with a freshly minted runId; returns the id.
    std::string start(gnc::sim::SimConfig cfg, const nlohmann::json& mission_json = nullptr);

    // Signals the run to stop. Thread join happens in the run's destructor
    // when the registry drops it. Returns false if runId is unknown.
    bool stop(const std::string& runId);

    // Connection lifecycle for /ws/simulation/{runId}.
    bool attach(const std::string& runId, drogon::WebSocketConnectionPtr conn);
    void detach(const std::string& runId, const drogon::WebSocketConnectionPtr& conn);

    bool exists(const std::string& runId) const;

    bool updateTuningParams(const std::string& runId, const gnc::TuningParams& params);

    // Rocket template cache
    struct RocketCache {
        std::shared_ptr<gnc::sim::AtmosphereTable> atmosphere_table;
        std::shared_ptr<gnc::sim::ThrustCurve>     thrust_curve;
        std::shared_ptr<gnc::sim::AeroCoeffs>      aero_coeffs;
        std::shared_ptr<gnc::sim::AeroCoeffs>      aero_coeffs_motor_on;
        std::shared_ptr<gnc::sim::AeroCoeffs>      aero_coeffs_motor_off;
        std::shared_ptr<gnc::sim::DampingCoeffs>       damping_coeffs;
        std::shared_ptr<gnc::sim::FinDeflectionCoeffs> fin_deflection_coeffs;
        std::shared_ptr<gnc::sim::RollAeroCoeffs>      roll_aero_coeffs;

        bool has_config = false;
        double mass_init_kg = 100.0;
        double mass_dry_kg = 70.0;
        double cd_A_m2 = 0.05;
        double burn_time_s = 4.0;
        double fin_delta_max_deg = 20.0;
        double fin_rate_max_deg_s = 300.0;
    };
    
    void load_rocket_cache(const std::string& template_id);
    RocketCache get_rocket_cache(const std::string& template_id) const;

    // Garbage-collect finished runs; called periodically.
    void gc();

private:
    SimRunRegistry() = default;

    static std::string new_id();

    mutable std::mutex                                          mu_;
    std::unordered_map<std::string, std::shared_ptr<SimRun>>    runs_;
    
    mutable std::mutex                                          cache_mu_;
    std::unordered_map<std::string, RocketCache>                rocket_cache_;
};

}  // namespace gnc::backend::sim
