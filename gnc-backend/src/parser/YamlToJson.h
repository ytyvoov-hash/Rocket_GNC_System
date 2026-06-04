// gnc-backend/src/parser/YamlToJson.h
// Shared helper: convert a yaml-cpp Node tree into nlohmann::json.
// Used by every controller that round-trips YAML to the FE.

#pragma once

#include <nlohmann/json.hpp>
#include <yaml-cpp/yaml.h>

namespace gnc::backend::parser {

// Converts a yaml-cpp Node into a nlohmann::json value. Scalars are coerced
// to bool/number/string in that order; missing or undefined nodes -> null.
nlohmann::json yaml_to_json(const YAML::Node& n);

// Read a YAML file and return its JSON representation. On error, returns
// {"error": "...", "path": "..."} so the controller can decide whether to
// 404 or 500.
nlohmann::json read_yaml_file(const std::string& path);

}  // namespace gnc::backend::parser
