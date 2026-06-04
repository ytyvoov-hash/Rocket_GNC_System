// gnc-backend/tests/auth_jwt_test.cc
//
// Unit tests for the RS256 JWT verifier that backs RBAC (auth/JwtVerifier).
// Generates an RSA keypair + self-signed cert in-process (OpenSSL), publishes
// it as a JWKS (x5c), signs tokens with jwt-cpp and asserts the verifier's
// accept/reject + role-extraction behaviour. No network, no Keycloak.

#include "auth/JwtVerifier.h"

#include <chrono>
#include <memory>
#include <stdexcept>
#include <string>

#include <gtest/gtest.h>
#include <jwt-cpp/jwt.h>
#include <openssl/bio.h>
#include <openssl/evp.h>
#include <openssl/pem.h>
#include <openssl/x509.h>

using namespace gnc::backend;

namespace {

struct RsaMaterial {
    std::string private_key_pem;
    std::string x5c_b64;  // base64(DER(cert)), single line — as in a JWK x5c[0]
};

RsaMaterial make_rsa_material(const std::string& cn = "gnc-test")
{
    EVP_PKEY* pkey = EVP_RSA_gen(2048);
    if (!pkey) throw std::runtime_error("EVP_RSA_gen failed");

    X509* x509 = X509_new();
    X509_set_version(x509, 2);
    ASN1_INTEGER_set(X509_get_serialNumber(x509), 1);
    X509_gmtime_adj(X509_getm_notBefore(x509), 0);
    X509_gmtime_adj(X509_getm_notAfter(x509), 60L * 60L * 24L * 2L);
    X509_set_pubkey(x509, pkey);

    X509_NAME* name = X509_get_subject_name(x509);
    X509_NAME_add_entry_by_txt(name, "CN", MBSTRING_ASC,
        reinterpret_cast<const unsigned char*>(cn.c_str()), -1, -1, 0);
    X509_set_issuer_name(x509, name);
    if (!X509_sign(x509, pkey, EVP_sha256())) {
        X509_free(x509); EVP_PKEY_free(pkey);
        throw std::runtime_error("X509_sign failed");
    }

    RsaMaterial out;
    {
        BIO* bio = BIO_new(BIO_s_mem());
        PEM_write_bio_PrivateKey(bio, pkey, nullptr, nullptr, 0, nullptr, nullptr);
        char* data = nullptr;
        long len = BIO_get_mem_data(bio, &data);
        out.private_key_pem.assign(data, static_cast<size_t>(len));
        BIO_free(bio);
    }
    {
        unsigned char* der = nullptr;
        int der_len = i2d_X509(x509, &der);
        BIO* b64 = BIO_new(BIO_f_base64());
        BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
        BIO* mem = BIO_new(BIO_s_mem());
        b64 = BIO_push(b64, mem);
        BIO_write(b64, der, der_len);
        BIO_flush(b64);
        char* data = nullptr;
        long len = BIO_get_mem_data(mem, &data);
        out.x5c_b64.assign(data, static_cast<size_t>(len));
        BIO_free_all(b64);
        OPENSSL_free(der);
    }
    X509_free(x509);
    EVP_PKEY_free(pkey);
    return out;
}

std::string make_jwks(const std::string& kid, const std::string& x5c)
{
    return std::string("{\"keys\":[{\"kty\":\"RSA\",\"use\":\"sig\",\"kid\":\"")
         + kid + "\",\"x5c\":[\"" + x5c + "\"]}]}";
}

std::string make_token(const std::string& priv_pem, const std::string& kid,
                       const std::string& iss, const std::string& aud,
                       const std::vector<std::string>& roles,
                       std::chrono::system_clock::time_point exp)
{
    picojson::object realm; picojson::array arr;
    for (const auto& r : roles) arr.push_back(picojson::value(r));
    realm["roles"] = picojson::value(arr);

    return jwt::create()
        .set_type("JWT")
        .set_key_id(kid)
        .set_issuer(iss)
        .set_audience(aud)
        .set_subject("user-123")
        .set_issued_at(std::chrono::system_clock::now())
        .set_expires_at(exp)
        .set_payload_claim("realm_access", jwt::claim(picojson::value(realm)))
        .sign(jwt::algorithm::rs256("", priv_pem, "", ""));
}

class JwtVerifierTest : public ::testing::Test {
protected:
    void SetUp() override {
        mat_ = make_rsa_material();
        cfg_.issuer   = iss_;
        cfg_.audience = aud_;
        cfg_.jwks_json = make_jwks(kid_, mat_.x5c_b64);
        verifier_ = JwtVerifier(cfg_);
    }
    std::chrono::system_clock::time_point in1h() const {
        return std::chrono::system_clock::now() + std::chrono::hours(1);
    }

    const std::string kid_ = "testkey";
    const std::string iss_ = "https://kc.example/realms/gnc";
    const std::string aud_ = "gnc-backend";
    RsaMaterial  mat_;
    JwtConfig    cfg_;
    JwtVerifier  verifier_;
};

TEST_F(JwtVerifierTest, ConfiguredWithJwks)
{
    EXPECT_TRUE(verifier_.configured());
}

TEST_F(JwtVerifierTest, ValidTokenAcceptedAndRoleIsHighest)
{
    auto t = make_token(mat_.private_key_pem, kid_, iss_, aud_,
                        {"viewer", "operator"}, in1h());
    auto o = verifier_.verify(t);
    ASSERT_TRUE(o.ok) << o.error;
    EXPECT_EQ(o.role, Role::Operator);
    EXPECT_EQ(o.subject, "user-123");
}

TEST_F(JwtVerifierTest, AdminRoleMapped)
{
    auto t = make_token(mat_.private_key_pem, kid_, iss_, aud_, {"admin"}, in1h());
    auto o = verifier_.verify(t);
    ASSERT_TRUE(o.ok) << o.error;
    EXPECT_EQ(o.role, Role::Admin);
}

TEST_F(JwtVerifierTest, UnrelatedRolesYieldAnonymousButAuthenticated)
{
    auto t = make_token(mat_.private_key_pem, kid_, iss_, aud_,
                        {"uma_authorization", "offline_access"}, in1h());
    auto o = verifier_.verify(t);
    EXPECT_TRUE(o.ok) << o.error;
    EXPECT_EQ(o.role, Role::Anonymous);
}

TEST_F(JwtVerifierTest, TamperedSignatureRejected)
{
    auto t = make_token(mat_.private_key_pem, kid_, iss_, aud_, {"admin"}, in1h());
    t[t.size() - 2] = (t[t.size() - 2] == 'A' ? 'B' : 'A');
    auto o = verifier_.verify(t);
    EXPECT_FALSE(o.ok);
    EXPECT_EQ(o.role, Role::Anonymous);
}

TEST_F(JwtVerifierTest, ExpiredTokenRejected)
{
    auto past = std::chrono::system_clock::now() - std::chrono::hours(2);
    auto t = make_token(mat_.private_key_pem, kid_, iss_, aud_, {"admin"}, past);
    EXPECT_FALSE(verifier_.verify(t).ok);
}

TEST_F(JwtVerifierTest, WrongAudienceRejected)
{
    auto t = make_token(mat_.private_key_pem, kid_, iss_, "other-aud", {"admin"}, in1h());
    EXPECT_FALSE(verifier_.verify(t).ok);
}

TEST_F(JwtVerifierTest, WrongIssuerRejected)
{
    auto t = make_token(mat_.private_key_pem, kid_, "https://evil/realms/x", aud_,
                        {"admin"}, in1h());
    EXPECT_FALSE(verifier_.verify(t).ok);
}

TEST_F(JwtVerifierTest, UnknownKidRejected)
{
    auto t = make_token(mat_.private_key_pem, "otherkid", iss_, aud_, {"admin"}, in1h());
    EXPECT_FALSE(verifier_.verify(t).ok);
}

TEST_F(JwtVerifierTest, UnconfiguredVerifierRejectsEverythingFailClosed)
{
    JwtVerifier empty;
    EXPECT_FALSE(empty.configured());
    auto t = make_token(mat_.private_key_pem, kid_, iss_, aud_, {"admin"}, in1h());
    EXPECT_FALSE(empty.verify(t).ok);
}

// Pure role-mapping checks (no crypto).
TEST(RoleMapping, HighestPrivilegeWins)
{
    EXPECT_EQ(role_from_realm_roles({"viewer", "engineer", "operator"}), Role::Operator);
    EXPECT_EQ(role_from_realm_roles({"admin", "viewer"}), Role::Admin);
    EXPECT_EQ(role_from_realm_roles({}), Role::Anonymous);
    EXPECT_EQ(role_from_realm_roles({"nonsense"}), Role::Anonymous);
    EXPECT_EQ(role_from_string("engineer"), Role::Engineer);
}

}  // namespace
