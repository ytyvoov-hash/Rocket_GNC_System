// gnc-backend/src/controllers/MissionsController.cc
// On lock: must freeze SHA-256 of actuator_library + controller_library
// into the mission YAML and write locked_at timestamp (v5.4 §2.8.7).

#include "MissionsController.h"

#include <nlohmann/json.hpp>
#include <yaml-cpp/yaml.h>
#include <filesystem>
#include <fstream>
#include <chrono>

namespace gnc::backend {

namespace {

drogon::HttpResponsePtr json_response(nlohmann::json body, drogon::HttpStatusCode code = drogon::k200OK)
{
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(code);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(body.dump());
    return resp;
}

}  // namespace

void MissionsController::list(const drogon::HttpRequestPtr&, Cb&& cb)
{
    cb(json_response(nlohmann::json::array()));
}

void MissionsController::create(const drogon::HttpRequestPtr& req, Cb&& cb)
{
    nlohmann::json res;
    res["validation"]["status"] = "valid";
    res["validation"]["errors"] = nlohmann::json::array();

    std::string body(req->getBody());
    if (body.empty()) {
        res["validation"]["status"] = "invalid";
        res["validation"]["errors"].push_back("Empty request body");
        cb(json_response(res, drogon::k400BadRequest));
        return;
    }

    std::string mission_id = "UNKNOWN";
    try {
        YAML::Node doc = YAML::Load(body);
        if (doc["mission_id"] && doc["mission_id"].IsScalar()) {
            mission_id = doc["mission_id"].as<std::string>();
        } else {
            mission_id = "MSN-" + std::to_string(std::chrono::system_clock::now().time_since_epoch().count());
        }

        std::filesystem::path mission_dir = std::filesystem::current_path() / "var" / "missions";
        std::filesystem::create_directories(mission_dir);
        std::filesystem::path file_path = mission_dir / (mission_id + ".yaml");
        
        std::ofstream out(file_path);
        if (!out) {
            throw std::runtime_error("Failed to open file for writing: " + file_path.string());
        }
        out << body;
        out.close();

    } catch (const YAML::Exception& e) {
        res["validation"]["status"] = "invalid";
        res["validation"]["errors"].push_back(std::string("YAML parsing error: ") + e.what());
        cb(json_response(res, drogon::k400BadRequest));
        return;
    } catch (const std::exception& e) {
        res["validation"]["status"] = "invalid";
        res["validation"]["errors"].push_back(std::string("Error saving mission: ") + e.what());
        cb(json_response(res, drogon::k500InternalServerError));
        return;
    }

    res["mission_id"] = mission_id;
    res["_stub"] = false;
    cb(json_response(res, drogon::k200OK));
}

void MissionsController::getOne(const drogon::HttpRequestPtr&, Cb&& cb, std::string id)
{
    cb(json_response({{"mission_id", id}, {"_stub", true}}, drogon::k503ServiceUnavailable));
}

void MissionsController::lock(const drogon::HttpRequestPtr&, Cb&& cb, std::string id)
{
    // TODO: freeze actuator + controller library SHA-256 into mission file.
    //       Audit-log the lock event.
    cb(json_response({
        {"mission_id", id},
        {"locked", false},
        {"_stub", true},
        {"msg", "lock not yet implemented"}
    }, drogon::k503ServiceUnavailable));
}

}  // namespace gnc::backend
