// gnc-backend/src/controllers/HealthController.h
// Liveness probe. Unauthenticated. Used by docker compose healthcheck and
// by the FE bootstrap to confirm the backend is reachable.

#pragma once

#include <drogon/HttpController.h>

namespace gnc::backend {

class HealthController : public drogon::HttpController<HealthController> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(HealthController::ping, "/api/v1/health", drogon::Get);
    METHOD_LIST_END

    void ping(const drogon::HttpRequestPtr& req,
              std::function<void(const drogon::HttpResponsePtr&)>&& cb);
};

}  // namespace gnc::backend
