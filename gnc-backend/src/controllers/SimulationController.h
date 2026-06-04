// gnc-backend/src/controllers/SimulationController.h
// REST endpoints for /api/v1/simulation/*. The actual sim engine runs
// in-process (links gnc-core directly — no IPC) per the recommendation
// in plan §9.3.

#pragma once

#include <drogon/HttpController.h>

#include "auth/KeycloakAuth.h"

namespace gnc::backend {

class SimulationController : public drogon::HttpController<SimulationController> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(SimulationController::start, "/api/v1/simulation/start",        drogon::Post, "gnc::backend::EngineerOnly");
        ADD_METHOD_TO(SimulationController::stop,  "/api/v1/simulation/{1}/stop",     drogon::Post, "gnc::backend::EngineerOnly");
        ADD_METHOD_TO(SimulationController::load_rocket, "/api/v1/simulation/load-rocket", drogon::Post, "gnc::backend::EngineerOnly");
        ADD_METHOD_TO(SimulationController::update_params, "/api/v1/simulation/{1}/update-params", drogon::Post, "gnc::backend::EngineerOnly");
        ADD_METHOD_TO(SimulationController::download_log,  "/api/v1/simulation/{1}/log/download", drogon::Get, "gnc::backend::ViewerOnly");
    METHOD_LIST_END

    using Cb = std::function<void(const drogon::HttpResponsePtr&)>;

    void start(const drogon::HttpRequestPtr& req, Cb&& cb);
    void stop (const drogon::HttpRequestPtr& req, Cb&& cb, std::string runId);
    void load_rocket(const drogon::HttpRequestPtr& req, Cb&& cb);
    void update_params(const drogon::HttpRequestPtr& req, Cb&& cb, std::string runId);
    void download_log(const drogon::HttpRequestPtr& req, Cb&& cb, std::string runId);
};

}  // namespace gnc::backend
