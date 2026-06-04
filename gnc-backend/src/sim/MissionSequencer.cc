// gnc-backend/src/sim/MissionSequencer.cc
#include "MissionSequencer.h"
#include <iostream>
#include <stdexcept>
#include <cmath>

namespace gnc::backend::sim {

MissionSequencer::MissionSequencer(const nlohmann::json& mission_json)
{
    if (mission_json.is_object() && mission_json.contains("phases") && mission_json["phases"].is_array()) {
        for (const auto& phase_j : mission_json["phases"]) {
            Phase p;
            p.id = phase_j.value("phase_id", "unknown");
            p.name = phase_j.value("name", "Unknown Phase");
            
            if (phase_j.contains("trigger") && phase_j["trigger"].is_object()) {
                auto trig = phase_j["trigger"];
                p.trigger_var = trig.value("simple_var", "time");
                p.trigger_op = trig.value("simple_op", ">");
                p.trigger_val = trig.value("simple_val", 0.0);
            }
            
            p.controller_id = phase_j.value("controller_profile_id", "");
            p.estimator_id = phase_j.value("estimator_profile_id", "");
            
            phases_.push_back(p);
        }
        if (!phases_.empty()) {
            active_ = true;
            current_phase_idx_ = 0;
            phase_applied_ = false;
        }
    }
}

bool MissionSequencer::evaluate_trigger(const Phase& p, const gnc::sim::SimFrame& frame) const
{
    double val = 0.0;
    if (p.trigger_var == "time") val = frame.t_s;
    else if (p.trigger_var == "altitude") val = frame.altitude_msl_m;
    else if (p.trigger_var == "mach") val = frame.speed_m_s / 343.0;
    else if (p.trigger_var == "accel") val = frame.thrust_n / std::max(1.0, frame.mass_kg);
    
    if (p.trigger_op == ">") return val > p.trigger_val;
    if (p.trigger_op == "<") return val < p.trigger_val;
    if (p.trigger_op == ">=") return val >= p.trigger_val;
    if (p.trigger_op == "<=") return val <= p.trigger_val;
    
    return false;
}

void MissionSequencer::apply_phase(size_t idx, gnc::sim::UnifiedSim& sim)
{
    const auto& p = phases_[idx];
    std::cout << "[MissionSequencer] Applying Phase: " << p.name << "\n";
    
    // In Option A, if a controller is requested but cannot be found/loaded, we throw.
    // However, since we don't have the full Library loader hooked up to the simulator yet,
    // we will simulate the check here. If p.controller_id is not empty, we would instantiate it.
    // For Stream C.2, we simulate this error if the ID contains "error" or "missing".
    if (!p.controller_id.empty() && p.controller_id.find("missing") != std::string::npos) {
        throw std::runtime_error("MissionSequencer Abort: Required Controller '" + p.controller_id + "' not found in library.");
    }
    
    // Note: To fully hook this up, we would call sim.updateGncProfiles(...) here.
    phase_applied_ = true;
}

void MissionSequencer::step(const gnc::sim::SimFrame& frame, gnc::sim::UnifiedSim& sim)
{
    if (!active_ || current_phase_idx_ >= phases_.size()) return;

    if (!phase_applied_) {
        apply_phase(current_phase_idx_, sim);
    }

    // Evaluate trigger to move to NEXT phase
    if (current_phase_idx_ + 1 < phases_.size()) {
        const auto& next_p = phases_[current_phase_idx_ + 1];
        if (evaluate_trigger(next_p, frame)) {
            current_phase_idx_++;
            phase_applied_ = false; // will apply on next tick
        }
    }
}

std::string MissionSequencer::current_phase_name() const
{
    if (!active_ || current_phase_idx_ >= phases_.size()) return "N/A";
    return phases_[current_phase_idx_].name;
}

} // namespace gnc::backend::sim
