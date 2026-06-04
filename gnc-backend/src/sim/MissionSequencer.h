// gnc-backend/src/sim/MissionSequencer.h
#pragma once

#include "gnc-core/sim/UnifiedSim.h"
#include <nlohmann/json.hpp>
#include <string>
#include <vector>

namespace gnc::backend::sim {

class MissionSequencer {
public:
    MissionSequencer() = default;
    explicit MissionSequencer(const nlohmann::json& mission_json);

    bool is_active() const { return active_; }

    // Evaluates triggers and transitions phases. Should be called every tick.
    // Throws std::runtime_error if a required GNC profile is missing (Option A).
    void step(const gnc::sim::SimFrame& frame, gnc::sim::UnifiedSim& sim);

    std::string current_phase_name() const;

private:
    struct Phase {
        std::string id;
        std::string name;
        
        std::string trigger_var;
        std::string trigger_op;
        double trigger_val{0.0};

        std::string controller_id;
        std::string estimator_id;
    };

    bool active_{false};
    std::vector<Phase> phases_;
    size_t current_phase_idx_{0};
    bool phase_applied_{false};
    
    bool evaluate_trigger(const Phase& p, const gnc::sim::SimFrame& frame) const;
    void apply_phase(size_t idx, gnc::sim::UnifiedSim& sim);
};

} // namespace gnc::backend::sim
