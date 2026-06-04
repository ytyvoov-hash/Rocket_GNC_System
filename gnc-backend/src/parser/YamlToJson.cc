#include "YamlToJson.h"

#include <fstream>

namespace gnc::backend::parser {

nlohmann::json yaml_to_json(const YAML::Node& n)
{
    if (!n) return nullptr;

    switch (n.Type()) {
        case YAML::NodeType::Null:
            return nullptr;

        case YAML::NodeType::Scalar: {
            // Try bool first (YAML 1.2 keywords), then int, then float, then string.
            try {
                bool b = n.as<bool>();
                // yaml-cpp converts "off"/"on" to bool too — accept that.
                return b;
            } catch (...) {}
            try {
                long long i = n.as<long long>();
                return i;
            } catch (...) {}
            try {
                double d = n.as<double>();
                return d;
            } catch (...) {}
            return n.as<std::string>();
        }

        case YAML::NodeType::Sequence: {
            nlohmann::json arr = nlohmann::json::array();
            for (auto&& item : n) arr.push_back(yaml_to_json(item));
            return arr;
        }

        case YAML::NodeType::Map: {
            nlohmann::json obj = nlohmann::json::object();
            for (auto&& kv : n) {
                obj[kv.first.as<std::string>()] = yaml_to_json(kv.second);
            }
            return obj;
        }

        case YAML::NodeType::Undefined:
        default:
            return nullptr;
    }
}

nlohmann::json read_yaml_file(const std::string& path)
{
    try {
        std::ifstream f(path);
        if (!f) {
            return { {"error", "file-not-found"}, {"path", path} };
        }
        auto node = YAML::Load(f);
        return yaml_to_json(node);
    } catch (const std::exception& e) {
        return { {"error", std::string("yaml-load: ") + e.what()},
                 {"path", path} };
    }
}

}  // namespace gnc::backend::parser
