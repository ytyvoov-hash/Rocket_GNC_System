// gnc-backend/src/validator/Verdict.h
// Single verdict tuple emitted by every clause function. Matches the FE
// `ValidationClause` / `ValidationReport` shape in
// gnc-frontend/src/store/rocketSlice.ts so JSON round-trips cleanly.

#pragma once

#include <nlohmann/json.hpp>
#include <string>
#include <vector>

namespace gnc::backend::validator {

enum class Verdict {
    Pass,
    Warn,
    Fail,
    NotApplicable,
};

inline const char* to_string(Verdict v)
{
    switch (v) {
        case Verdict::Pass:           return "PASS";
        case Verdict::Warn:           return "WARN";
        case Verdict::Fail:           return "FAIL";
        case Verdict::NotApplicable:  return "N/A";
    }
    return "UNKNOWN";
}

struct ClauseResult {
    std::string clause;     // e.g. "C2"
    Verdict     verdict;
    std::string message;
};

inline nlohmann::json to_json(const ClauseResult& r)
{
    return {
        {"clause",  r.clause},
        {"verdict", to_string(r.verdict)},
        {"message", r.message}
    };
}

// Aggregate report. `overall` is FAIL if any clause is FAIL,
// else WARN if any is WARN, else PASS.
struct Report {
    std::vector<ClauseResult> clauses;
    std::string               run_at;     // ISO-8601 timestamp; empty == not run
};

inline Verdict aggregate(const std::vector<ClauseResult>& cs)
{
    bool any_warn = false;
    for (const auto& c : cs) {
        if (c.verdict == Verdict::Fail) return Verdict::Fail;
        if (c.verdict == Verdict::Warn) any_warn = true;
    }
    return any_warn ? Verdict::Warn : Verdict::Pass;
}

inline nlohmann::json to_json(const Report& r)
{
    nlohmann::json arr = nlohmann::json::array();
    for (const auto& c : r.clauses) arr.push_back(to_json(c));
    return {
        {"clauses", arr},
        {"overall", to_string(aggregate(r.clauses))},
        {"run_at",  r.run_at.empty() ? nlohmann::json(nullptr)
                                     : nlohmann::json(r.run_at)}
    };
}

}  // namespace gnc::backend::validator
