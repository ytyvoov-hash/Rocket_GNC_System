// gnc-backend/src/controllers/HardwareController.cc
//
// scan          — fresh USB enumeration via hal::native::UsbScan, overlaid
//                 with the user's saved assignments. Output shape matches
//                 the FE `HardwarePort` interface verbatim.
// assignments   — GET/PUT against ./var/gnc_device_assignments.json. PUT
//                 requires X-Operator-ID + X-Reason headers (audit trail).
//                 Body accepts either a raw array OR a {assignments:[…]}
//                 envelope so older clients keep working.
// hardware-mapping — GET/PATCH the rocket's hardware_mapping.yaml.

#include "HardwareController.h"
#include "ConfigPaths.h"
#include "../parser/YamlToJson.h"
#include "../hal/native/UsbScan.h"

#include <nlohmann/json.hpp>
#include <chrono>
#include <filesystem>
#include <fstream>

namespace gnc::backend {

namespace {

drogon::HttpResponsePtr json_response(nlohmann::json body,
                                      drogon::HttpStatusCode code = drogon::k200OK)
{
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(code);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(body.dump());
    return resp;
}

// Reads the assignments JSON from disk; returns null on missing/error.
nlohmann::json read_assignments_or_null()
{
    std::ifstream f(device_assignments_path());
    if (!f) return nullptr;
    try {
        return nlohmann::json::parse(f);
    } catch (...) {
        return nullptr;
    }
}

}  // namespace

void HardwareController::scan(const drogon::HttpRequestPtr&, Cb&& cb)
{
    auto ports       = hal::native::enumerate_usb_serial_ports();
    auto assignments = read_assignments_or_null();
    auto wire        = hal::native::to_wire_json(ports, assignments);
    cb(json_response(wire));
}

void HardwareController::getAssignments(const drogon::HttpRequestPtr&, Cb&& cb)
{
    std::filesystem::path path = device_assignments_path();

    std::ifstream f(path);
    if (!f) {
        // No assignments yet — empty array is the canonical "no overrides".
        return cb(json_response(nlohmann::json::array()));
    }

    nlohmann::json doc;
    try {
        doc = nlohmann::json::parse(f);
    } catch (const std::exception& e) {
        return cb(json_response({{"error",   "corrupt-assignments-file"},
                                 {"path",    path.string()},
                                 {"details", e.what()}},
                                drogon::k500InternalServerError));
    }

    // Tolerate the legacy {assignments:[…], _audit:{…}} envelope by
    // unwrapping it before responding. Front-end always sees a raw array.
    if (doc.is_object() && doc.contains("assignments") &&
        doc["assignments"].is_array()) {
        return cb(json_response(doc["assignments"]));
    }
    if (doc.is_array()) return cb(json_response(doc));

    cb(json_response(nlohmann::json::array()));
}

void HardwareController::putAssignments(const drogon::HttpRequestPtr& req, Cb&& cb)
{
    const std::string operator_id = req->getHeader("X-Operator-ID");
    const std::string reason      = req->getHeader("X-Reason");

    if (operator_id.empty() || reason.empty()) {
        return cb(json_response({{"error", "missing-operator-context"},
                                 {"required_headers", {"X-Operator-ID", "X-Reason"}}},
                                drogon::k400BadRequest));
    }

    nlohmann::json body;
    try {
        body = nlohmann::json::parse(req->body());
    } catch (const std::exception& e) {
        return cb(json_response({{"error", "invalid-json"},
                                 {"details", e.what()}},
                                drogon::k400BadRequest));
    }

    // Accept either the raw `DeviceAssignment[]` (current FE) or the
    // legacy `{assignments:[…]}` envelope.
    nlohmann::json arr = nlohmann::json::array();
    if (body.is_array()) {
        arr = std::move(body);
    } else if (body.is_object() && body.contains("assignments") &&
               body["assignments"].is_array()) {
        arr = body["assignments"];
    } else {
        return cb(json_response({{"error", "invalid-assignments-format"},
                                 {"expected", "DeviceAssignment[] or {assignments:[…]}"}},
                                drogon::k400BadRequest));
    }

    // Light per-element validation. We require vidPid + role; operator
    // metadata can be empty per-row because the request-level headers
    // already authoritatively identify the operator.
    for (std::size_t i = 0; i < arr.size(); ++i) {
        const auto& a = arr[i];
        if (!a.is_object() ||
            !a.contains("vidPid") || !a["vidPid"].is_string() ||
            !a.contains("role")   || !a["role"].is_string()) {
            return cb(json_response({{"error", "invalid-assignment-row"},
                                     {"index", i}},
                                    drogon::k400BadRequest));
        }
    }

    std::filesystem::path path = device_assignments_path();
    std::error_code ec;
    if (path.has_parent_path()) {
        std::filesystem::create_directories(path.parent_path(), ec);
    }
    std::ofstream f(path, std::ios::trunc);
    if (!f) {
        return cb(json_response({{"error", "failed-to-write-assignments"},
                                 {"path",  path.string()}},
                                drogon::k500InternalServerError));
    }
    f << arr.dump(2);
    f.close();

    // Response = the freshly persisted array. Audit log entry is written
    // automatically by the post-handling advice in main.cc.
    cb(json_response(arr));
}

void HardwareController::getMapping(const drogon::HttpRequestPtr&, Cb&& cb)
{
    std::string rocket_id = active_rocket_id();
    std::filesystem::path mapping_path = rockets_root() / rocket_id / "hardware_mapping.yaml";
    
    auto json_result = parser::read_yaml_file(mapping_path.string());
    
    if (json_result.contains("error")) {
        if (json_result["error"] == "file-not-found") {
            cb(json_response({{"error", "hardware-mapping-not-found"},
                              {"rocket_id", rocket_id},
                              {"path", mapping_path.string()}}, 
                             drogon::k404NotFound));
        } else {
            cb(json_response({{"error", "failed-to-read-hardware-mapping"},
                              {"details", json_result}},
                             drogon::k500InternalServerError));
        }
        return;
    }
    
    cb(json_response(json_result));
}

void HardwareController::patchMapping(const drogon::HttpRequestPtr& req, Cb&& cb)
{
    // Extract Operator ID and Reason from headers
    std::string operator_id = req->getHeader("X-Operator-ID");
    std::string reason = req->getHeader("X-Reason");
    
    if (operator_id.empty() || reason.empty()) {
        cb(json_response({{"error", "missing-operator-context"},
                          {"required_headers", {"X-Operator-ID", "X-Reason"}}},
                         drogon::k400BadRequest));
        return;
    }
    
    try {
        auto patch = nlohmann::json::parse(req->body());
        
        std::string rocket_id = active_rocket_id();
        std::filesystem::path mapping_path = rockets_root() / rocket_id / "hardware_mapping.yaml";
        
        // Read existing YAML
        auto existing_json = parser::read_yaml_file(mapping_path.string());
        if (existing_json.contains("error")) {
            cb(json_response({{"error", "failed-to-read-existing-mapping"},
                              {"details", existing_json}},
                             drogon::k500InternalServerError));
            return;
        }
        
        // Apply patch (JSON merge patch semantics)
        for (auto& [key, value] : patch.items()) {
            existing_json[key] = value;
        }
        
        // Convert back to YAML and write
        // Note: yaml-cpp doesn't have direct JSON->YAML conversion, so we'll write JSON for now
        // In production, this should use a proper YAML library with JSON round-trip support
        std::ofstream f(mapping_path);
        if (!f) {
            cb(json_response({{"error", "failed-to-write-mapping"},
                              {"path", mapping_path.string()}},
                             drogon::k500InternalServerError));
            return;
        }
        
        // Write as JSON with .yaml extension (temporary - should be proper YAML)
        f << existing_json.dump(2);
        f.close();
        
        // Log audit entry
        std::filesystem::path audit_path = mapping_path.parent_path() / (mapping_path.stem().string() + "_audit.json");
        std::ofstream audit(audit_path, std::ios::app);
        if (audit) {
            nlohmann::json audit_entry = {
                {"timestamp", std::chrono::duration_cast<std::chrono::milliseconds>(
                    std::chrono::system_clock::now().time_since_epoch()).count()},
                {"operator_id", operator_id},
                {"reason", reason},
                {"patch", patch}
            };
            audit << audit_entry.dump() << "\n";
        }
        
        cb(json_response({{"success", true},
                          {"path", mapping_path.string()},
                          {"rocket_id", rocket_id}}));
    } catch (const std::exception& e) {
        cb(json_response({{"error", "failed-to-process-patch"},
                          {"details", e.what()}},
                         drogon::k500InternalServerError));
    }
}

}  // namespace gnc::backend
