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
    std::string clause;       // e.g. "C2"
    Verdict     verdict;
    std::string message;
    // Required clauses MUST be implemented AND PASS for the template to pass.
    // A required clause that is un-implemented (NotApplicable) or errored
    // blocks aggregation (fail-closed). Optional clauses may be skipped.
    // `run_all` sets this from the canonical clause-spec table; the per-clause
    // functions leave it at the safe default (required).
    bool        required = true;
};

inline nlohmann::json to_json(const ClauseResult& r)
{
    return {
        {"clause",   r.clause},
        {"verdict",  to_string(r.verdict)},
        {"message",  r.message},
        {"required", r.required}
    };
}

// Aggregate report.
struct Report {
    std::vector<ClauseResult> clauses;
    std::string               run_at;     // ISO-8601 timestamp; empty == not run
};

// Fail-closed aggregation (v8 invariant INV-1).
//   overall == FAIL  if any clause is FAIL, OR any *required* clause is
//                     un-implemented / not-run (NotApplicable);
//   overall == WARN   else if any clause is WARN;
//   overall == PASS   else (every required clause implemented and PASS).
//
// This deliberately replaces the previous behavior, where NotApplicable was
// ignored and a template passing only the handful of implemented clauses
// reported overall PASS while every physics-/safety-relevant clause was
// silently skipped (a false PASS). An un-run required safety clause now
// blocks certification rather than passing it. Optional clauses that are
// NotApplicable do not block.
inline Verdict aggregate(const std::vector<ClauseResult>& cs)
{
    bool any_warn = false;
    for (const auto& c : cs) {
        if (c.verdict == Verdict::Fail) return Verdict::Fail;
        if (c.required && c.verdict == Verdict::NotApplicable) return Verdict::Fail;
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
