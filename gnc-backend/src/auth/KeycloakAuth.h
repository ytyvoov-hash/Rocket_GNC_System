// gnc-backend/src/auth/KeycloakAuth.h
// RBAC min-role filters for Drogon. Roles come from a signature-verified
// Keycloak JWT (see JwtVerifier); there is no more `X-Dev-Role` trust path.
//
// Each named filter derives from drogon::HttpFilter<T> so Drogon can
// instantiate it by class name from the controllers' ADD_METHOD_TO lists,
// e.g. ADD_METHOD_TO(C::create, "/api/v1/...", Post, "gnc::backend::EngineerOnly").

#pragma once

#include "Role.h"

#include <drogon/HttpFilter.h>

namespace gnc::backend {

// Verified role for this request: the role from a valid Bearer JWT, else
// Anonymous. Only when the build enables the dev bypass (GNC_ALLOW_AUTH_BYPASS)
// AND env GNC_AUTH_DISABLED=1 is set does this return Admin without a token.
Role current_role(const drogon::HttpRequestPtr& req);

// Shared enforcement: continue the chain iff current_role(req) >= min_role,
// otherwise short-circuit with 401 (no/invalid token) or 403 (insufficient).
void enforce_min_role(Role min_role,
                      const drogon::HttpRequestPtr& req,
                      drogon::FilterCallback&& failCb,
                      drogon::FilterChainCallback&& nextCb);

class ViewerOnly : public drogon::HttpFilter<ViewerOnly> {
public:
    void doFilter(const drogon::HttpRequestPtr& req,
                  drogon::FilterCallback&& failCb,
                  drogon::FilterChainCallback&& nextCb) override
    {
        enforce_min_role(Role::Viewer, req, std::move(failCb), std::move(nextCb));
    }
};

class EngineerOnly : public drogon::HttpFilter<EngineerOnly> {
public:
    void doFilter(const drogon::HttpRequestPtr& req,
                  drogon::FilterCallback&& failCb,
                  drogon::FilterChainCallback&& nextCb) override
    {
        enforce_min_role(Role::Engineer, req, std::move(failCb), std::move(nextCb));
    }
};

class OperatorOnly : public drogon::HttpFilter<OperatorOnly> {
public:
    void doFilter(const drogon::HttpRequestPtr& req,
                  drogon::FilterCallback&& failCb,
                  drogon::FilterChainCallback&& nextCb) override
    {
        enforce_min_role(Role::Operator, req, std::move(failCb), std::move(nextCb));
    }
};

class AdminOnly : public drogon::HttpFilter<AdminOnly> {
public:
    void doFilter(const drogon::HttpRequestPtr& req,
                  drogon::FilterCallback&& failCb,
                  drogon::FilterChainCallback&& nextCb) override
    {
        enforce_min_role(Role::Admin, req, std::move(failCb), std::move(nextCb));
    }
};

}  // namespace gnc::backend
