// gnc-backend/src/auth/JwtVerifier.cc
// Implementation of JwtVerifier using jwt-cpp (header-only, OpenSSL-backed).
// jwt-cpp + openssl are already declared in conanfile.txt.

#include "JwtVerifier.h"

#include <jwt-cpp/jwt.h>

namespace gnc::backend {

namespace {

// Pull realm_access.roles[] out of the decoded token. Tolerant of a missing
// or malformed claim (returns empty ⇒ Anonymous).
std::vector<std::string> extract_realm_roles(
    const jwt::decoded_jwt<jwt::traits::kazuho_picojson>& decoded)
{
    std::vector<std::string> roles;
    if (!decoded.has_payload_claim("realm_access")) return roles;

    const picojson::value v = decoded.get_payload_claim("realm_access").to_json();
    if (!v.is<picojson::object>()) return roles;

    const auto& obj = v.get<picojson::object>();
    auto it = obj.find("roles");
    if (it == obj.end() || !it->second.is<picojson::array>()) return roles;

    for (const auto& e : it->second.get<picojson::array>()) {
        if (e.is<std::string>()) roles.push_back(e.get<std::string>());
    }
    return roles;
}

}  // namespace

JwtVerifier::JwtVerifier(JwtConfig cfg)
    : cfg_(std::move(cfg)), configured_(!cfg_.jwks_json.empty())
{
}

AuthOutcome JwtVerifier::verify(const std::string& token) const
{
    AuthOutcome out;

    if (!configured_) {
        out.error = "JWT verifier not configured (no JWKS); rejecting";
        return out;
    }
    if (token.empty()) {
        out.error = "empty token";
        return out;
    }

    try {
        auto decoded = jwt::decode(token);

        // --- locate the signing key in the JWKS by kid ---
        if (!decoded.has_key_id()) {
            out.error = "token has no `kid` header";
            return out;
        }
        auto jwks = jwt::parse_jwks(cfg_.jwks_json);
        auto jwk  = jwks.get_jwk(decoded.get_key_id());  // throws if absent

        if (!jwk.has_x5c()) {
            out.error = "JWK for kid has no x5c certificate";
            return out;
        }
        const std::string pem = jwt::helper::extract_pubkey_from_cert(
            jwt::helper::convert_base64_der_to_pem(jwk.get_x5c_key_value()));

        // --- build the verifier: RS256 signature + standard claims ---
        auto verifier = jwt::verify()
            .allow_algorithm(jwt::algorithm::rs256(pem, "", "", ""))
            .leeway(static_cast<size_t>(cfg_.leeway_s < 0 ? 0 : cfg_.leeway_s));

        if (cfg_.require_issuer && !cfg_.issuer.empty()) {
            verifier = verifier.with_issuer(cfg_.issuer);
        }
        if (cfg_.require_audience && !cfg_.audience.empty()) {
            verifier = verifier.with_audience(cfg_.audience);
        }

        verifier.verify(decoded);  // throws on signature/exp/iss/aud failure

        // --- success: extract identity + role ---
        if (decoded.has_subject()) out.subject = decoded.get_subject();
        out.role = role_from_realm_roles(extract_realm_roles(decoded));
        out.ok   = true;
        return out;
    } catch (const std::exception& e) {
        out.ok    = false;
        out.role  = Role::Anonymous;
        out.error = std::string("JWT verification failed: ") + e.what();
        return out;
    }
}

}  // namespace gnc::backend
