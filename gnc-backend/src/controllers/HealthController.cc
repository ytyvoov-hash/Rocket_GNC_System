#include "HealthController.h"

#include <nlohmann/json.hpp>

namespace gnc::backend {

void HealthController::ping(const drogon::HttpRequestPtr& /*req*/,
                            std::function<void(const drogon::HttpResponsePtr&)>&& cb)
{
    nlohmann::json body = {
        {"status", "ok"},
        {"service", "gnc-backend"},
        {"version", "0.1.0-dev"},
        {"schema_version", "v5.4"}
    };
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(body.dump());
    cb(resp);
}

}  // namespace gnc::backend
