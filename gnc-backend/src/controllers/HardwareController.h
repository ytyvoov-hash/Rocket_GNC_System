// gnc-backend/src/controllers/HardwareController.h
// REST endpoints for /api/v1/hardware/* and /api/v1/hardware-mapping.
// v5.4 §6.4.7 (S13a), §7.3.13, §A.6.

#pragma once

#include <drogon/HttpController.h>

namespace gnc::backend {

class HardwareController : public drogon::HttpController<HardwareController> {
public:
    METHOD_LIST_BEGIN
        ADD_METHOD_TO(HardwareController::scan,            "/api/v1/hardware/scan",        drogon::Get);
        ADD_METHOD_TO(HardwareController::getAssignments,  "/api/v1/hardware/assignments", drogon::Get);
        ADD_METHOD_TO(HardwareController::putAssignments,  "/api/v1/hardware/assignments", drogon::Put);
        ADD_METHOD_TO(HardwareController::getMapping,      "/api/v1/hardware-mapping",     drogon::Get);
        ADD_METHOD_TO(HardwareController::patchMapping,    "/api/v1/hardware-mapping",     drogon::Patch);
    METHOD_LIST_END

    using Cb = std::function<void(const drogon::HttpResponsePtr&)>;

    void scan           (const drogon::HttpRequestPtr& req, Cb&& cb);
    void getAssignments (const drogon::HttpRequestPtr& req, Cb&& cb);
    void putAssignments (const drogon::HttpRequestPtr& req, Cb&& cb);
    void getMapping     (const drogon::HttpRequestPtr& req, Cb&& cb);
    void patchMapping   (const drogon::HttpRequestPtr& req, Cb&& cb);
};

}  // namespace gnc::backend
