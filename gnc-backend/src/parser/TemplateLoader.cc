#include "TemplateLoader.h"
#include "YamlToJson.h"

#include <algorithm>
#include <fstream>
#include <set>

namespace gnc::backend::parser {

namespace fs = std::filesystem;

namespace {

struct ThrustCurveInfo {
    double total_impulse = 0.0;
    double burn_time = 0.0;
    bool ok = false;
};

ThrustCurveInfo calculate_thrust_curve_info(const fs::path& path) {
    ThrustCurveInfo info;
    std::ifstream file(path);
    if (!file.is_open()) return info;

    std::string line;
    if (!std::getline(file, line)) return info; // Skip header

    std::vector<double> times;
    std::vector<double> thrusts;

    while (std::getline(file, line)) {
        if (line.empty()) continue;
        std::stringstream ss(line);
        std::string t_str, f_str;
        if (std::getline(ss, t_str, ',') && std::getline(ss, f_str, ',')) {
            try {
                double t = std::stod(t_str);
                double f = std::stod(f_str);
                times.push_back(t);
                thrusts.push_back(f);
            } catch (...) {}
        }
    }

    if (times.empty()) return info;

    double max_t = 0.0;
    for (size_t i = 0; i < times.size(); ++i) {
        if (thrusts[i] > 1e-6) {
            max_t = std::max(max_t, times[i]);
        }
    }
    if (max_t == 0.0) {
        max_t = times.back();
    }
    info.burn_time = max_t;

    double impulse = 0.0;
    for (size_t i = 0; i < times.size() - 1; ++i) {
        double dt = times[i+1] - times[i];
        double avg_thrust = (thrusts[i] + thrusts[i+1]) / 2.0;
        impulse += avg_thrust * dt;
    }
    info.total_impulse = impulse;
    info.ok = true;

    return info;
}

bool ends_with_ci(const std::string& s, const std::string& suffix)
{
    if (s.size() < suffix.size()) return false;
    auto a = s.substr(s.size() - suffix.size());
    auto eq = std::equal(a.begin(), a.end(), suffix.begin(),
                         [](char x, char y) {
                             return std::tolower(static_cast<unsigned char>(x)) ==
                                    std::tolower(static_cast<unsigned char>(y));
                         });
    return eq;
}

// Catalogue every csv/cad file in the rocket folder so the FE can render the
// "data files" inventory and the parser can later swap relative paths for
// HDF5-converted blobs.
nlohmann::json catalogue_files(const fs::path& dir, std::vector<Diagnostic>& diags)
{
    nlohmann::json csvs = nlohmann::json::array();
    nlohmann::json cad  = nlohmann::json::array();
    nlohmann::json other = nlohmann::json::array();

    static const std::set<std::string> known_yaml = {
        "rocket_properties.yaml", "hardware_mapping.yaml",
        "tolerances.yaml", "scenarios.yaml", "envelope.yaml"
    };
    static const std::set<std::string> cad_exts = { ".sldprt", ".step", ".stp", ".stl", ".igs", ".iges", ".glb", ".gltf" };

    if (!fs::is_directory(dir)) return nlohmann::json::object();

    for (auto& entry : fs::directory_iterator(dir)) {
        if (!entry.is_regular_file()) continue;
        const auto name = entry.path().filename().string();
        std::string ext_lc = entry.path().extension().string();
        std::transform(ext_lc.begin(), ext_lc.end(), ext_lc.begin(),
                       [](unsigned char c) { return std::tolower(c); });
        const auto sz = entry.file_size();

        nlohmann::json item = {
            {"name", name},
            {"size_bytes", static_cast<std::uint64_t>(sz)}
        };

        if (ends_with_ci(name, ".csv")) {
            csvs.push_back(item);
        } else if (cad_exts.count(ext_lc)) {
            cad.push_back(item);
        } else if (ends_with_ci(name, ".yaml") || ends_with_ci(name, ".yml")) {
            if (!known_yaml.count(name)) {
                diags.push_back({DiagSeverity::Info, name,
                                 "unrecognised YAML file (not in canonical 11-file layout)"});
            }
        } else if (ends_with_ci(name, ".md")) {
            // skip; informational
        } else {
            other.push_back(item);
        }
    }

    return {
        {"csv_files", csvs},
        {"cad_files", cad},
        {"other_files", other}
    };
}

}  // namespace

TemplateLoader::TemplateLoader(fs::path rockets_root)
    : rockets_root_(std::move(rockets_root)) {}

nlohmann::json TemplateLoader::list_summary() const
{
    nlohmann::json out = nlohmann::json::array();
    if (!fs::is_directory(rockets_root_)) {
        return out;
    }

    for (auto& entry : fs::directory_iterator(rockets_root_)) {
        if (!entry.is_directory()) continue;
        const std::string id = entry.path().filename().string();

        // Skip dot-folders and the README.
        if (id.empty() || id[0] == '.') continue;

        const auto props = entry.path() / "rocket_properties.yaml";
        if (!fs::is_regular_file(props)) {
            // Folder exists but isn't a complete rocket; skip silently so
            // partial scaffolds don't pollute the FE list.
            continue;
        }

        nlohmann::json summary = {
            {"template_id", id},
            {"display_name", id},
            {"type", "unknown"},
            {"status", "draft"},
            {"num_stages", nullptr}
        };

        try {
            auto doc = read_yaml_file(props.string());
            if (doc.is_object()) {
                if (doc.contains("template_id"))   summary["template_id"]   = doc["template_id"];
                if (doc.contains("display_name"))  summary["display_name"]  = doc["display_name"];
                if (doc.contains("type"))          summary["type"]          = doc["type"];
                if (doc.contains("status"))        summary["status"]        = doc["status"];
                if (doc.contains("num_stages"))    summary["num_stages"]    = doc["num_stages"];
            }
        } catch (...) {
            // leave defaults
        }
        out.push_back(summary);
    }
    return out;
}

ParseResult TemplateLoader::load(const std::string& template_id) const
{
    ParseResult r;
    r.template_id = template_id;
    r.rocket_dir  = rockets_root_ / template_id;

    if (!fs::is_directory(r.rocket_dir)) {
        r.diagnostics.push_back({DiagSeverity::Error, "",
                                 "rocket directory not found: " + r.rocket_dir.string()});
        return r;
    }

    const auto props = r.rocket_dir / "rocket_properties.yaml";
    if (!fs::is_regular_file(props)) {
        r.diagnostics.push_back({DiagSeverity::Error, "rocket_properties.yaml",
                                 "required file missing"});
        return r;
    }

    nlohmann::json doc = read_yaml_file(props.string());
    if (doc.is_object() && doc.contains("error")) {
        r.diagnostics.push_back({DiagSeverity::Error, "rocket_properties.yaml",
                                 doc.value("error", std::string("yaml-error"))});
        return r;
    }

    // Calculate total impulse and burn time dynamically from thrust curve
    const auto thrust_path = r.rocket_dir / "thrust_curve.csv";
    if (fs::exists(thrust_path)) {
        auto info = calculate_thrust_curve_info(thrust_path);
        if (info.ok) {
            if (doc.is_object() && doc.contains("stages") && doc["stages"].is_array() && doc["stages"].size() > 0) {
                auto& stage = doc["stages"][0];
                if (stage.is_object() && stage.contains("propulsion") && stage["propulsion"].is_object()) {
                    stage["propulsion"]["total_impulse_Ns"] = info.total_impulse;
                    stage["propulsion"]["burn_time_s"] = info.burn_time;
                    r.diagnostics.push_back({DiagSeverity::Info, "thrust_curve.csv",
                                             "Dynamically calculated total_impulse_Ns: " + std::to_string(info.total_impulse) +
                                             ", burn_time_s: " + std::to_string(info.burn_time)});
                }
            }
        }
    }

    // Optional siblings.
    nlohmann::json hw = nullptr;
    const auto hw_path = r.rocket_dir / "hardware_mapping.yaml";
    if (fs::is_regular_file(hw_path)) {
        hw = read_yaml_file(hw_path.string());
    } else {
        r.diagnostics.push_back({DiagSeverity::Warning, "hardware_mapping.yaml",
                                 "missing — clause C11 will FAIL"});
    }

    nlohmann::json tol = nullptr;
    const auto tol_path = r.rocket_dir / "tolerances.yaml";
    if (fs::is_regular_file(tol_path)) tol = read_yaml_file(tol_path.string());

    nlohmann::json scn = nullptr;
    const auto scn_path = r.rocket_dir / "scenarios.yaml";
    if (fs::is_regular_file(scn_path)) scn = read_yaml_file(scn_path.string());

    nlohmann::json env = nullptr;
    const auto env_path = r.rocket_dir / "envelope.yaml";
    if (fs::is_regular_file(env_path)) env = read_yaml_file(env_path.string());

    auto inv = catalogue_files(r.rocket_dir, r.diagnostics);

    // Assemble the merged document. The canonical "data" object is exactly
    // what the FE rocket-template store consumes after a /templates/{id} GET.
    r.data = {
        {"template_id", doc.value("template_id", template_id)},
        {"rocket",      doc},
        {"hardware",    hw},
        {"tolerances",  tol},
        {"scenarios",   scn},
        {"envelope",    env},
        {"inventory",   inv}
    };

    r.ok = true;
    return r;
}

}  // namespace gnc::backend::parser
