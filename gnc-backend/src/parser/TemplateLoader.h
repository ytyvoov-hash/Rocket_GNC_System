// gnc-backend/src/parser/TemplateLoader.h
// Stream B (Phase β.1) — reads a rocket folder layout and assembles a single
// JSON document representing the canonical multi-stage template plus catalogued
// CSV / CAD references.
//
// Folder layout (per plan §4.1, 11-file canonical):
//
//   rockets/<id>/
//   ├── rocket_properties.yaml     (canonical template — required)
//   ├── hardware_mapping.yaml      (per-rocket — required)
//   ├── tolerances.yaml            (optional at parse time)
//   ├── scenarios.yaml             (optional)
//   ├── envelope.yaml              (optional)
//   ├── onboarding_report.md       (informational)
//   ├── *.csv                      (aero / atmosphere / thrust / fin)
//   └── *.SLDPRT|*.STEP|*.STL      (CAD)
//
// HDF5 hypercube conversion (Phase β.2) is NOT done here — CSVs are catalogued
// by relative path only.

#pragma once

#include <filesystem>
#include <nlohmann/json.hpp>
#include <string>
#include <vector>

namespace gnc::backend::parser {

enum class DiagSeverity {
    Info,
    Warning,
    Error,
};

struct Diagnostic {
    DiagSeverity severity;
    std::string  file;       // relative path inside the rocket folder
    std::string  message;
};

struct ParseResult {
    bool                    ok{false};
    std::string             template_id;
    std::filesystem::path   rocket_dir;
    nlohmann::json          data;          // merged JSON: properties + catalogues
    std::vector<Diagnostic> diagnostics;
};

class TemplateLoader {
public:
    explicit TemplateLoader(std::filesystem::path rockets_root);

    // List every rocket folder under rockets_root_. Each entry is a brief
    // summary (template_id, type, status, num_stages) suitable for the FE
    // S2 Library Selector list view.
    nlohmann::json list_summary() const;

    // Load one rocket by its folder name (== template_id).
    ParseResult load(const std::string& template_id) const;

private:
    std::filesystem::path rockets_root_;
};

}  // namespace gnc::backend::parser
