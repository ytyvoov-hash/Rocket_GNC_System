// gnc-backend/src/controllers/LibrariesController.h
// REST endpoints for /api/v1/actuator-library and /api/v1/controller-library.
// v5.4 §2.8, §2.9.

#pragma once

#include <drogon/HttpController.h>

namespace gnc::backend {

class LibrariesController : public drogon::HttpController<LibrariesController> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(LibrariesController::getActuators,    "/api/v1/actuator-library",     drogon::Get);
        ADD_METHOD_TO(LibrariesController::patchActuators,  "/api/v1/actuator-library",     drogon::Patch);
        ADD_METHOD_TO(LibrariesController::getControllers,  "/api/v1/controller-library",   drogon::Get);
        ADD_METHOD_TO(LibrariesController::patchControllers,"/api/v1/controller-library",   drogon::Patch);
    METHOD_LIST_END

    using Cb = std::function<void(const drogon::HttpResponsePtr&)>;

    void getActuators    (const drogon::HttpRequestPtr& req, Cb&& cb);
    void patchActuators  (const drogon::HttpRequestPtr& req, Cb&& cb);
    void getControllers  (const drogon::HttpRequestPtr& req, Cb&& cb);
    void patchControllers(const drogon::HttpRequestPtr& req, Cb&& cb);
};

}  // namespace gnc::backend
