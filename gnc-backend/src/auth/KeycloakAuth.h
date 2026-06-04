// gnc-backend/src/auth/KeycloakAuth.h
// JWT (RS256) verification against Keycloak's JWKS, with role mapping to
// the v5.4 §1.7 RBAC matrix (viewer / engineer / operator / admin).
// Implemented as a Drogon HttpFilter so every guarded route runs through it.

#pragma once

#include <drogon/HttpFilter.h>

#include <string>

namespace gnc::backend {

enum class Role : std::uint8_t {
    Anonymous = 0,
    Viewer    = 1,
    Engineer  = 2,
    Operator  = 3,
    Admin     = 4,
};

// Minimum-role filter. Subclasses set the threshold at construction.
class MinRoleFilter : public drogon::HttpFilter<MinRoleFilter, /*AutoCreation=*/false> {
public:
    explicit MinRoleFilter(Role min_role) : min_role_(min_role) {}

    void doFilter(const drogon::HttpRequestPtr& req,
                  drogon::FilterCallback&& failCb,
                  drogon::FilterChainCallback&& nextCb) override;

private:
    Role min_role_;
};

// Convenience factory. Use one of these per registered controller method.
class ViewerOnly   : public MinRoleFilter { public: ViewerOnly()   : MinRoleFilter(Role::Viewer)   {} };
class EngineerOnly : public MinRoleFilter { public: EngineerOnly() : MinRoleFilter(Role::Engineer) {} };
class OperatorOnly : public MinRoleFilter { public: OperatorOnly() : MinRoleFilter(Role::Operator) {} };
class AdminOnly    : public MinRoleFilter { public: AdminOnly()    : MinRoleFilter(Role::Admin)    {} };

}  // namespace gnc::backend
