// gnc-backend/src/controllers/TemplatesController.h
// REST endpoints for /api/v1/templates. v5.4 §2.9 + internal-system plan §5.1.

#pragma once

#include <drogon/HttpController.h>

#include "auth/KeycloakAuth.h"

namespace gnc::backend {

class TemplatesController : public drogon::HttpController<TemplatesController> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(TemplatesController::list,      "/api/v1/templates",                drogon::Get,    "gnc::backend::ViewerOnly");
        ADD_METHOD_TO(TemplatesController::create,    "/api/v1/templates",                drogon::Post,   "gnc::backend::EngineerOnly");
        ADD_METHOD_TO(TemplatesController::getOne,    "/api/v1/templates/{1}",            drogon::Get,    "gnc::backend::ViewerOnly");
        ADD_METHOD_TO(TemplatesController::patchOne,  "/api/v1/templates/{1}",            drogon::Patch,  "gnc::backend::EngineerOnly");
        ADD_METHOD_TO(TemplatesController::replace,   "/api/v1/templates/{1}",            drogon::Put,    "gnc::backend::EngineerOnly");
        ADD_METHOD_TO(TemplatesController::remove,    "/api/v1/templates/{1}",            drogon::Delete, "gnc::backend::AdminOnly");
        ADD_METHOD_TO(TemplatesController::validate,  "/api/v1/templates/{1}/validate",   drogon::Post,   "gnc::backend::EngineerOnly");
        ADD_METHOD_TO(TemplatesController::duplicate, "/api/v1/templates/{1}/duplicate",  drogon::Post,   "gnc::backend::EngineerOnly");
        ADD_METHOD_TO(TemplatesController::history,   "/api/v1/templates/{1}/history",    drogon::Get,    "gnc::backend::ViewerOnly");
        ADD_METHOD_TO(TemplatesController::getCad,    "/api/v1/templates/{1}/cad",        drogon::Get,    "gnc::backend::ViewerOnly");
    METHOD_LIST_END

    using Cb = std::function<void(const drogon::HttpResponsePtr&)>;

    void list      (const drogon::HttpRequestPtr& req, Cb&& cb);
    void create    (const drogon::HttpRequestPtr& req, Cb&& cb);
    void getOne    (const drogon::HttpRequestPtr& req, Cb&& cb, std::string id);
    void patchOne  (const drogon::HttpRequestPtr& req, Cb&& cb, std::string id);
    void replace   (const drogon::HttpRequestPtr& req, Cb&& cb, std::string id);
    void remove    (const drogon::HttpRequestPtr& req, Cb&& cb, std::string id);
    void validate  (const drogon::HttpRequestPtr& req, Cb&& cb, std::string id);
    void duplicate (const drogon::HttpRequestPtr& req, Cb&& cb, std::string id);
    void history   (const drogon::HttpRequestPtr& req, Cb&& cb, std::string id);
    void getCad    (const drogon::HttpRequestPtr& req, Cb&& cb, std::string id);
};

}  // namespace gnc::backend
