// gnc-backend/src/validator/Validator.h
// 25 clause functions, one per row of v5.4 Appendix A.1. Each function takes
// the merged template document produced by TemplateLoader (i.e. the JSON with
// keys: rocket, hardware, tolerances, scenarios, envelope, inventory) and
// returns a single ClauseResult.
//
// Implemented in Wave 1: C1, C2, C15, C17 (mass + structural sanity).
// All others return NotApplicable with a "stub" message until Stream B
// is fully built out (β.3 in the plan).

#pragma once

#include "Verdict.h"

namespace gnc::backend::validator {

ClauseResult run_C1 (const nlohmann::json& doc);  // Schema validation
ClauseResult run_C2 (const nlohmann::json& doc);  // Mass > 0
ClauseResult run_C3 (const nlohmann::json& doc);  // CG / inertia coupling
ClauseResult run_C4 (const nlohmann::json& doc);  // Body-frame conventions
ClauseResult run_C5 (const nlohmann::json& doc);  // Reference geometry > 0
ClauseResult run_C6 (const nlohmann::json& doc);  // Aero CSV monotonicity
ClauseResult run_C7 (const nlohmann::json& doc);  // Thrust curve sanity
ClauseResult run_C8 (const nlohmann::json& doc);  // Atmosphere coverage
ClauseResult run_C9 (const nlohmann::json& doc);  // Damping coefficients
ClauseResult run_C10(const nlohmann::json& doc);  // Fin-set geometry
ClauseResult run_C11(const nlohmann::json& doc);  // Hardware map exists
ClauseResult run_C12(const nlohmann::json& doc);  // Pyro count vs separations
ClauseResult run_C13(const nlohmann::json& doc);  // Seeker block (if capable)
ClauseResult run_C14(const nlohmann::json& doc);  // Autopilot capable_modes
ClauseResult run_C15(const nlohmann::json& doc);  // num_stages == len(stages)
ClauseResult run_C16(const nlohmann::json& doc);  // stage_index monotonic
ClauseResult run_C17(const nlohmann::json& doc);  // Terminal / separation rules
ClauseResult run_C18(const nlohmann::json& doc);  // Pyro IDs unique per stage
ClauseResult run_C19(const nlohmann::json& doc);  // Aerospike implementation_status
ClauseResult run_C20(const nlohmann::json& doc);  // controller_ref resolves
ClauseResult run_C21(const nlohmann::json& doc);  // actuator_ref resolves
ClauseResult run_C22(const nlohmann::json& doc);  // Gain-set completeness
ClauseResult run_C23(const nlohmann::json& doc);  // Launch-rail consistency
ClauseResult run_C24(const nlohmann::json& doc);  // abort_policy present
ClauseResult run_C25(const nlohmann::json& doc);  // CAN utilisation budget

// Run every clause in order and return the assembled report. The caller
// fills in `run_at` (we don't take a clock dependency in the validator
// to keep it pure / unit-testable).
Report run_all(const nlohmann::json& doc);

}  // namespace gnc::backend::validator
