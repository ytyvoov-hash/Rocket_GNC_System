// gnc-backend/src/validator/Validator.cc
// Wave-1 implementations of C1, C2, C15, C17. All other clauses delegate
// to a `not_yet_implemented` helper so the FE renders a complete 25-row
// validation report immediately and we can flip stubs to real impls one
// at a time without touching call sites.

#include "Validator.h"

#include <set>

namespace gnc::backend::validator {

namespace {

ClauseResult stub(const std::string& clause, const std::string& note)
{
    return { clause, Verdict::NotApplicable,
             "stub: " + note + " (not yet implemented in Stream B Wave 1)" };
}

const nlohmann::json* rocket_node(const nlohmann::json& doc)
{
    if (doc.is_object() && doc.contains("rocket") && doc["rocket"].is_object()) {
        return &doc["rocket"];
    }
    return nullptr;
}

}  // namespace

// --------------------------------------------------------------------------
// C1 — Schema validation. Phase β.3 will plug in a JSON-Schema-2020-12
//      validator (e.g. `valijson` or `nlohmann/json-schema`). Wave 1 checks
//      the minimum required top-level keys so the rest of the validator can
//      assume basic shape.
// --------------------------------------------------------------------------
ClauseResult run_C1(const nlohmann::json& doc)
{
    auto* r = rocket_node(doc);
    if (!r) {
        return { "C1", Verdict::Fail,
                 "merged document has no `rocket` block (parser error)" };
    }
    const std::vector<std::string> required = {
        "template_id", "num_stages", "stages"
    };
    std::vector<std::string> missing;
    for (const auto& k : required) {
        if (!r->contains(k)) missing.push_back(k);
    }
    if (!missing.empty()) {
        std::string list;
        for (auto& m : missing) { list += m; list += ","; }
        list.pop_back();
        return { "C1", Verdict::Fail,
                 "missing required top-level fields: " + list };
    }
    if (!(*r)["stages"].is_array() || (*r)["stages"].empty()) {
        return { "C1", Verdict::Fail,
                 "`stages` must be a non-empty array" };
    }
    return { "C1", Verdict::Pass,
             "minimum required keys present (full JSON-Schema 2020-12 check pending β.3)" };
}

// --------------------------------------------------------------------------
// C2 — Every stage has positive mass_dry_kg. propellant_mass_kg may be 0
//      for a coast stage but never negative.
// --------------------------------------------------------------------------
ClauseResult run_C2(const nlohmann::json& doc)
{
    auto* r = rocket_node(doc);
    if (!r || !r->contains("stages")) {
        return { "C2", Verdict::Fail, "stages array missing" };
    }
    const auto& stages = (*r)["stages"];
    for (std::size_t i = 0; i < stages.size(); ++i) {
        const auto& s = stages[i];
        if (!s.is_object() || !s.contains("physical")) {
            return { "C2", Verdict::Fail,
                     "stage[" + std::to_string(i) + "] missing `physical`" };
        }
        const auto& p = s["physical"];
        const double m_dry  = p.value("mass_dry_kg", -1.0);
        const double m_prop = p.value("propellant_mass_kg", 0.0);
        if (!(m_dry > 0.0)) {
            return { "C2", Verdict::Fail,
                     "stage[" + std::to_string(i) + "].mass_dry_kg must be > 0 (got " +
                     std::to_string(m_dry) + ")" };
        }
        if (m_prop < 0.0) {
            return { "C2", Verdict::Fail,
                     "stage[" + std::to_string(i) + "].propellant_mass_kg must be >= 0 (got " +
                     std::to_string(m_prop) + ")" };
        }
    }
    return { "C2", Verdict::Pass,
             "all " + std::to_string(stages.size()) + " stage(s) have positive dry mass" };
}

// --------------------------------------------------------------------------
// C15 — num_stages must equal stages.size().
// --------------------------------------------------------------------------
ClauseResult run_C15(const nlohmann::json& doc)
{
    auto* r = rocket_node(doc);
    if (!r) return { "C15", Verdict::Fail, "rocket node missing" };

    const int declared = r->value("num_stages", -1);
    const auto& stages = r->value("stages", nlohmann::json::array());
    const int actual   = static_cast<int>(stages.size());
    if (declared < 1) {
        return { "C15", Verdict::Fail, "num_stages must be >= 1" };
    }
    if (declared != actual) {
        return { "C15", Verdict::Fail,
                 "num_stages = " + std::to_string(declared) +
                 " but stages array has " + std::to_string(actual) + " entries" };
    }
    return { "C15", Verdict::Pass,
             "num_stages = " + std::to_string(declared) + " matches array length" };
}

// --------------------------------------------------------------------------
// C17 — Terminal / separation rules.
//   - Exactly one stage has is_terminal == true.
//   - That stage MUST be the last in the array (highest stage_index).
//   - The terminal stage MUST NOT have a `separation` block.
//   - Every NON-terminal stage MUST have a `separation` block.
// --------------------------------------------------------------------------
ClauseResult run_C17(const nlohmann::json& doc)
{
    auto* r = rocket_node(doc);
    if (!r || !r->contains("stages") || !(*r)["stages"].is_array()) {
        return { "C17", Verdict::Fail, "stages array missing" };
    }
    const auto& stages = (*r)["stages"];

    int terminal_count = 0;
    int terminal_idx   = -1;
    for (std::size_t i = 0; i < stages.size(); ++i) {
        if (stages[i].value("is_terminal", false)) {
            terminal_count += 1;
            terminal_idx = static_cast<int>(i);
        }
    }
    if (terminal_count != 1) {
        return { "C17", Verdict::Fail,
                 "exactly one stage must have is_terminal=true (got " +
                 std::to_string(terminal_count) + ")" };
    }
    if (terminal_idx != static_cast<int>(stages.size()) - 1) {
        return { "C17", Verdict::Fail,
                 "terminal stage must be the last in the array (was index " +
                 std::to_string(terminal_idx) + " of " +
                 std::to_string(stages.size()) + ")" };
    }
    for (std::size_t i = 0; i < stages.size(); ++i) {
        const auto& s        = stages[i];
        const bool  terminal = s.value("is_terminal", false);
        const bool  has_sep  = s.contains("separation") && !s["separation"].is_null();
        if (terminal && has_sep) {
            return { "C17", Verdict::Fail,
                     "terminal stage[" + std::to_string(i) +
                     "] must NOT define a separation block" };
        }
        if (!terminal && !has_sep) {
            return { "C17", Verdict::Fail,
                     "non-terminal stage[" + std::to_string(i) +
                     "] must define a separation block" };
        }
    }
    return { "C17", Verdict::Pass,
             "terminal stage is correctly placed and separation blocks are consistent" };
}

// --------------------------------------------------------------------------
// All remaining clauses — Wave 1 stubs with descriptive notes.
// --------------------------------------------------------------------------
ClauseResult run_C3 (const nlohmann::json&) { return stub("C3",  "CG / inertia mass-coupling check"); }
ClauseResult run_C4 (const nlohmann::json&) { return stub("C4",  "body-frame convention check"); }
ClauseResult run_C5 (const nlohmann::json&) { return stub("C5",  "reference geometry > 0 check"); }
ClauseResult run_C6 (const nlohmann::json&) { return stub("C6",  "aero CSV monotonicity check"); }
ClauseResult run_C7 (const nlohmann::json&) { return stub("C7",  "thrust curve sanity check"); }
ClauseResult run_C8 (const nlohmann::json&) { return stub("C8",  "atmosphere altitude coverage check"); }
ClauseResult run_C9 (const nlohmann::json&) { return stub("C9",  "damping coefficient sign check"); }
ClauseResult run_C10(const nlohmann::json&) { return stub("C10", "fin-set geometry check"); }
ClauseResult run_C11(const nlohmann::json& doc) {
    // Wave 1: rely on the parser diagnostic; we just check the merged doc.
    if (!doc.is_object() || doc.value("hardware", nlohmann::json(nullptr)).is_null()) {
        return { "C11", Verdict::Fail, "rockets/<id>/hardware_mapping.yaml not found" };
    }
    return { "C11", Verdict::Pass, "hardware_mapping.yaml present" };
}
ClauseResult run_C12(const nlohmann::json&) { return stub("C12", "pyro-count vs separation events"); }
ClauseResult run_C13(const nlohmann::json&) { return stub("C13", "seeker block (when seeker_capable)"); }
ClauseResult run_C14(const nlohmann::json&) { return stub("C14", "autopilot capable_modes coverage"); }
ClauseResult run_C16(const nlohmann::json&) { return stub("C16", "stage_index monotonic"); }
ClauseResult run_C18(const nlohmann::json&) { return stub("C18", "pyro IDs unique per stage"); }
ClauseResult run_C19(const nlohmann::json&) { return stub("C19", "aerospike implementation_status"); }
ClauseResult run_C20(const nlohmann::json&) { return stub("C20", "controller_ref resolves in library"); }
ClauseResult run_C21(const nlohmann::json&) { return stub("C21", "actuator_ref resolves in library"); }
ClauseResult run_C22(const nlohmann::json&) { return stub("C22", "gain-set completeness vs algorithm"); }
ClauseResult run_C23(const nlohmann::json&) { return stub("C23", "launch rail vs initial attitude consistency"); }
ClauseResult run_C24(const nlohmann::json&) { return stub("C24", "abort_policy present"); }
ClauseResult run_C25(const nlohmann::json&) { return stub("C25", "CAN utilisation budget"); }

// --------------------------------------------------------------------------
// run_all — fixed order; FE renders the table in the same order.
// --------------------------------------------------------------------------
Report run_all(const nlohmann::json& doc)
{
    Report r;
    r.clauses.reserve(25);
    r.clauses.push_back(run_C1 (doc));
    r.clauses.push_back(run_C2 (doc));
    r.clauses.push_back(run_C3 (doc));
    r.clauses.push_back(run_C4 (doc));
    r.clauses.push_back(run_C5 (doc));
    r.clauses.push_back(run_C6 (doc));
    r.clauses.push_back(run_C7 (doc));
    r.clauses.push_back(run_C8 (doc));
    r.clauses.push_back(run_C9 (doc));
    r.clauses.push_back(run_C10(doc));
    r.clauses.push_back(run_C11(doc));
    r.clauses.push_back(run_C12(doc));
    r.clauses.push_back(run_C13(doc));
    r.clauses.push_back(run_C14(doc));
    r.clauses.push_back(run_C15(doc));
    r.clauses.push_back(run_C16(doc));
    r.clauses.push_back(run_C17(doc));
    r.clauses.push_back(run_C18(doc));
    r.clauses.push_back(run_C19(doc));
    r.clauses.push_back(run_C20(doc));
    r.clauses.push_back(run_C21(doc));
    r.clauses.push_back(run_C22(doc));
    r.clauses.push_back(run_C23(doc));
    r.clauses.push_back(run_C24(doc));
    r.clauses.push_back(run_C25(doc));
    return r;
}

}  // namespace gnc::backend::validator
