// gnc-backend/src/auth/Role.h
// RBAC role enum + mappings, deliberately free of any Drogon / framework
// dependency so the JWT verification core can be unit-tested standalone
// (see tests + the v8 plan INV-2: server-enforced authority).

#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace gnc::backend {

// Ordered by privilege; numeric value is the comparison key used by the
// min-role filters (higher == more privileged).
enum class Role : std::uint8_t {
    Anonymous = 0,
    Viewer    = 1,
    Engineer  = 2,
    Operator  = 3,
    Admin     = 4,
};

inline const char* to_string(Role r)
{
    switch (r) {
        case Role::Anonymous: return "anonymous";
        case Role::Viewer:    return "viewer";
        case Role::Engineer:  return "engineer";
        case Role::Operator:  return "operator";
        case Role::Admin:     return "admin";
    }
    return "anonymous";
}

// Map a single Keycloak realm role string to a Role. Unknown / unrelated
// roles map to Anonymous so they never accidentally grant privilege.
inline Role role_from_string(const std::string& s)
{
    if (s == "admin")    return Role::Admin;
    if (s == "operator") return Role::Operator;
    if (s == "engineer") return Role::Engineer;
    if (s == "viewer")   return Role::Viewer;
    return Role::Anonymous;
}

// Reduce a token's realm_access.roles[] to the single highest-privilege Role.
inline Role role_from_realm_roles(const std::vector<std::string>& roles)
{
    Role best = Role::Anonymous;
    for (const auto& r : roles) {
        Role mapped = role_from_string(r);
        if (static_cast<std::uint8_t>(mapped) > static_cast<std::uint8_t>(best)) {
            best = mapped;
        }
    }
    return best;
}

}  // namespace gnc::backend
