// gnc-backend/src/controllers/MissionsController.h
// REST endpoints for /api/v1/missions. v5.4 §2.7.

#pragma once

#include <drogon/HttpController.h>

#include "auth/KeycloakAuth.h"

namespace gnc::backend {

class MissionsController : public drogon::HttpController<MissionsController> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(MissionsController::list,    "/api/v1/missions",            drogon::Get,  "gnc::backend::ViewerOnly");
        ADD_METHOD_TO(MissionsController::create,  "/api/v1/missions",            drogon::Post, "gnc::backend::EngineerOnly");
        ADD_METHOD_TO(MissionsController::getOne,  "/api/v1/missions/{1}",        drogon::Get,  "gnc::backend::ViewerOnly");
        ADD_METHOD_TO(MissionsController::lock,    "/api/v1/missions/{1}/lock",   drogon::Post, "gnc::backend::OperatorOnly");
    METHOD_LIST_END

    using Cb = std::function<void(const drogon::HttpResponsePtr&)>;

    void list   (const drogon::HttpRequestPtr& req, Cb&& cb);
    void create (const drogon::HttpRequestPtr& req, Cb&& cb);
    void getOne (const drogon::HttpRequestPtr& req, Cb&& cb, std::string id);
    void lock   (const drogon::HttpRequestPtr& req, Cb&& cb, std::string id);
};

}  // namespace gnc::backend
