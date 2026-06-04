// gnc-backend/src/controllers/AuditController.h
// Read-only audit trail. v5.4 §1.7. 5-year retention.

#pragma once

#include <drogon/HttpController.h>

#include "auth/KeycloakAuth.h"

namespace gnc::backend {

class AuditController : public drogon::HttpController<AuditController> {
public:
    METHOD_LIST_BEGIN
        // Audit trail is sensitive (who did what); operator+ only.
        ADD_METHOD_TO(AuditController::list, "/api/v1/audit", drogon::Get, "gnc::backend::OperatorOnly");
    METHOD_LIST_END

    using Cb = std::function<void(const drogon::HttpResponsePtr&)>;

    void list(const drogon::HttpRequestPtr& req, Cb&& cb);
};

}  // namespace gnc::backend
