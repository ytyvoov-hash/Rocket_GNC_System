// gnc-backend/src/auth/JwtVerifier.h
// Real RS256 JWT verification against a Keycloak JWKS, with no Drogon
// dependency so it can be unit-tested standalone. Replaces the spoofable
// `X-Dev-Role` header the v8 audit flagged (Backend §5 / risk: auth bypass).
//
// Verification performed (RFC 7519):
//   1. Decode the JWT, find the signing key in the JWKS by `kid`.
//   2. Verify the RS256 signature with that key (from the JWK x5c cert).
//   3. Check exp / nbf (with leeway), and iss / aud when configured.
//   4. Extract realm_access.roles[] and reduce to the highest Role.
//
// Anything that fails any step yields AuthOutcome{ ok=false } with a reason;
// the caller (MinRoleFilter) must treat that as Anonymous / reject.

#pragma once

#include "Role.h"

#include <string>

namespace gnc::backend {

struct JwtConfig {
    std::string issuer;            // expected `iss` (checked when require_issuer)
    std::string audience;          // expected `aud` (checked when require_audience)
    std::string jwks_json;         // Keycloak JWKS document (raw JSON text)
    long        leeway_s        = 60;     // clock-skew tolerance for exp/nbf
    bool        require_issuer  = true;
    bool        require_audience = true;
};

struct AuthOutcome {
    bool        ok      = false;
    Role        role    = Role::Anonymous;
    std::string subject;           // `sub` claim (for audit), empty on failure
    std::string error;             // human-readable reason when !ok
};

class JwtVerifier {
public:
    JwtVerifier() = default;
    explicit JwtVerifier(JwtConfig cfg);

    // True once a non-empty JWKS has been supplied. A verifier that is not
    // configured rejects every token (fail-closed) rather than allowing it.
    bool configured() const { return configured_; }

    // `token` is the raw compact JWT (no "Bearer " prefix).
    AuthOutcome verify(const std::string& token) const;

private:
    JwtConfig cfg_;
    bool      configured_ = false;
};

}  // namespace gnc::backend
