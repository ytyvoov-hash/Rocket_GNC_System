// gnc-backend/src/auth/KeycloakAuth.cc
//
// Skeleton JWT verification. Until the jwt-cpp dependency is wired through
// Conan and the JWKS endpoint is reachable, this filter:
//
//   - if env var GNC_AUTH_DISABLED=1 is set, lets every request pass
//     (intended ONLY for local dev / FE-smoke);
//   - otherwise requires a Bearer token; decodes role claim from a header
//     X-Dev-Role for now; will be replaced by signature-verified JWT claims.
//
// Real implementation must:
//   1. Cache JWKS fetched from custom_config.keycloak.jwks_uri.
//   2. Verify RS256 signature with the kid-matched key.
//   3. Check exp, iat, iss, aud per RFC 7519.
//   4. Extract realm_access.roles[] and map to Role enum.

#include "KeycloakAuth.h"

#include <cstdlib>
#include <drogon/HttpResponse.h>

namespace gnc::backend {

namespace {

Role role_from_request(const drogon::HttpRequestPtr& req)
{
    if (const char* off = std::getenv("GNC_AUTH_DISABLED"); off && std::string(off) == "1") {
        return Role::Admin;   // dev-mode bypass
    }
    auto bearer = req->getHeader("Authorization");
    if (bearer.empty()) return Role::Anonymous;

    // TODO[Stream A]: parse + verify JWT, extract realm_access.roles.
    // Temporary: dev header to drive role testing.
    auto devRole = req->getHeader("X-Dev-Role");
    if (devRole == "admin")    return Role::Admin;
    if (devRole == "operator") return Role::Operator;
    if (devRole == "engineer") return Role::Engineer;
    if (devRole == "viewer")   return Role::Viewer;
    return Role::Viewer;
}

}  // namespace

void MinRoleFilter::doFilter(const drogon::HttpRequestPtr& req,
                             drogon::FilterCallback&& failCb,
                             drogon::FilterChainCallback&& nextCb)
{
    auto role = role_from_request(req);
    if (static_cast<std::uint8_t>(role) >= static_cast<std::uint8_t>(min_role_)) {
        nextCb();
        return;
    }
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(drogon::k403Forbidden);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(R"({"error":"forbidden","required_min_role":"engineer_or_higher"})");
    failCb(resp);
}

}  // namespace gnc::backend
