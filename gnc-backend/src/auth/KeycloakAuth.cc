// gnc-backend/src/auth/KeycloakAuth.cc
//
// Resolves the caller's role from a signature-verified Keycloak JWT and
// enforces a per-route minimum role. This replaces the previous spoofable
// `X-Dev-Role` header (v8 audit: Backend auth bypass, CRITICAL).
//
// Verification config is read once from the Drogon custom_config `keycloak`
// block:
//   "keycloak": {
//     "issuer":            "https://kc.example/realms/gnc",
//     "audience":          "gnc-backend",
//     "jwks":              "{ ... raw JWKS JSON ... }",   // or:
//     "jwks_file":         "./config/keycloak_jwks.json",
//     "leeway_s":          60,
//     "require_issuer":    true,
//     "require_audience":  true
//   }
//
// Dev bypass: only if the binary was compiled with GNC_ALLOW_AUTH_BYPASS
// (default for local/dev builds) AND env GNC_AUTH_DISABLED=1 is set at run
// time does every request resolve to Admin. Release / flight builds MUST be
// compiled with -DGNC_ALLOW_AUTH_BYPASS=OFF so the bypass does not exist in
// the binary at all (v8 INV-6).

#include "KeycloakAuth.h"
#include "JwtVerifier.h"

#include <cstdlib>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

#include <drogon/HttpResponse.h>
#include <drogon/drogon.h>

namespace gnc::backend {

namespace {

std::string read_file(const std::string& path)
{
    std::ifstream in(path, std::ios::binary);
    if (!in) return {};
    std::ostringstream ss;
    ss << in.rdbuf();
    return ss.str();
}

JwtConfig load_jwt_config()
{
    JwtConfig cfg;
    const auto& custom = drogon::app().getCustomConfig();
    if (!custom.isMember("keycloak")) return cfg;  // unconfigured ⇒ reject all
    const auto& kc = custom["keycloak"];

    cfg.issuer   = kc.get("issuer",   "").asString();
    cfg.audience = kc.get("audience", "").asString();
    cfg.leeway_s = kc.get("leeway_s", 60).asInt64();
    cfg.require_issuer   = kc.get("require_issuer",   true).asBool();
    cfg.require_audience = kc.get("require_audience", true).asBool();

    if (kc.isMember("jwks") && kc["jwks"].isString()) {
        cfg.jwks_json = kc["jwks"].asString();
    } else if (kc.isMember("jwks_file")) {
        cfg.jwks_json = read_file(kc["jwks_file"].asString());
    }
    return cfg;
}

// Built once on first use (after main() has loaded the config file).
const JwtVerifier& verifier()
{
    static const JwtVerifier v{ load_jwt_config() };
    if (!v.configured()) {
        static bool warned = false;
        if (!warned) {
            std::cerr << "[auth] WARNING: no keycloak.jwks configured; all "
                         "guarded routes will reject (401) unless the dev "
                         "bypass is enabled.\n";
            warned = true;
        }
    }
    return v;
}

// Strip an optional "Bearer " prefix (case-insensitive) from the header.
std::string strip_bearer(const std::string& h)
{
    if (h.size() >= 7) {
        std::string p = h.substr(0, 7);
        for (auto& c : p) c = static_cast<char>(::tolower(c));
        if (p == "bearer ") return h.substr(7);
    }
    return h;
}

#ifdef GNC_ALLOW_AUTH_BYPASS
bool dev_bypass_enabled()
{
    const char* off = std::getenv("GNC_AUTH_DISABLED");
    if (off && std::string(off) == "1") {
        static bool warned = false;
        if (!warned) {
            std::cerr << "[auth] WARNING: GNC_AUTH_DISABLED=1 — RBAC bypassed, "
                         "every request treated as Admin. NEVER use this in a "
                         "release/flight build.\n";
            warned = true;
        }
        return true;
    }
    return false;
}
#endif

}  // namespace

Role current_role(const drogon::HttpRequestPtr& req)
{
#ifdef GNC_ALLOW_AUTH_BYPASS
    if (dev_bypass_enabled()) return Role::Admin;
#endif
    const std::string auth = req->getHeader("Authorization");
    if (auth.empty()) return Role::Anonymous;

    AuthOutcome out = verifier().verify(strip_bearer(auth));
    if (!out.ok) {
        LOG_DEBUG << "[auth] token rejected: " << out.error;
        return Role::Anonymous;
    }
    return out.role;
}

void enforce_min_role(Role min_role,
                      const drogon::HttpRequestPtr& req,
                      drogon::FilterCallback&& failCb,
                      drogon::FilterChainCallback&& nextCb)
{
    const Role role = current_role(req);
    if (static_cast<std::uint8_t>(role) >= static_cast<std::uint8_t>(min_role)) {
        nextCb();
        return;
    }

    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    // 401 when there is no recognised identity at all, 403 when the caller is
    // authenticated but under-privileged.
    if (role == Role::Anonymous) {
        resp->setStatusCode(drogon::k401Unauthorized);
        resp->setBody(std::string(R"({"error":"unauthorized","detail":"valid Bearer JWT required","required_min_role":")")
                      + to_string(min_role) + R"("})");
    } else {
        resp->setStatusCode(drogon::k403Forbidden);
        resp->setBody(std::string(R"({"error":"forbidden","role":")") + to_string(role)
                      + R"(","required_min_role":")" + to_string(min_role) + R"("})");
    }
    failCb(resp);
}

// ---------------------------------------------------------------------------
// Force the four filter types to be ODR-used in this TU. The controllers only
// reference them by class-name string in ADD_METHOD_TO, which does not
// instantiate the type — without this, drogon::HttpFilter<T>'s static
// self-registration would never run and the filter lookup at route-binding
// time would fail (leaving the route unprotected). Constructing one of each
// here guarantees registration before app().run() binds filters to handlers.
namespace {
const ViewerOnly   g_reg_viewer{};
const EngineerOnly g_reg_engineer{};
const OperatorOnly g_reg_operator{};
const AdminOnly    g_reg_admin{};
}  // namespace

}  // namespace gnc::backend
