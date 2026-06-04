// gnc-backend/src/controllers/LaunchController.h
// REST surface for the server-side launch interlock (/api/v1/launch/*).
// The authority/state machine lives in launch/LaunchAuthority; this controller
// is the RBAC-guarded HTTP adapter. ARM/LAUNCH/ABORT require Operator+; reading
// state is Viewer+; reset (recover to IDLE) is Admin-only.

#pragma once

#include <drogon/HttpController.h>

#include "auth/KeycloakAuth.h"

namespace gnc::backend {

class LaunchController : public drogon::HttpController<LaunchController> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(LaunchController::state,  "/api/v1/launch/state",  drogon::Get,  "gnc::backend::ViewerOnly");
        ADD_METHOD_TO(LaunchController::arm,    "/api/v1/launch/arm",    drogon::Post, "gnc::backend::OperatorOnly");
        ADD_METHOD_TO(LaunchController::launch, "/api/v1/launch/launch", drogon::Post, "gnc::backend::OperatorOnly");
        ADD_METHOD_TO(LaunchController::abort,  "/api/v1/launch/abort",  drogon::Post, "gnc::backend::OperatorOnly");
        ADD_METHOD_TO(LaunchController::reset,  "/api/v1/launch/reset",  drogon::Post, "gnc::backend::AdminOnly");
    METHOD_LIST_END

    using Cb = std::function<void(const drogon::HttpResponsePtr&)>;

    void state (const drogon::HttpRequestPtr& req, Cb&& cb);
    void arm   (const drogon::HttpRequestPtr& req, Cb&& cb);
    void launch(const drogon::HttpRequestPtr& req, Cb&& cb);
    void abort (const drogon::HttpRequestPtr& req, Cb&& cb);
    void reset (const drogon::HttpRequestPtr& req, Cb&& cb);
};

}  // namespace gnc::backend
