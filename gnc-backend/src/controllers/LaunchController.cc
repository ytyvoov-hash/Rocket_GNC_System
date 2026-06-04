// gnc-backend/src/controllers/LaunchController.cc
// See LaunchController.h.
//
// Hardware key resolution (highest precedence first):
//   1. env GNC_HARDWARE_KEY        — release/flight: inject via the secret store
//   2. custom_config.launch.hardware_key  — dev convenience (dev.json)
// If neither is set the authority is "not provisioned" and arm() returns 503.
//
// The arm key is read from the JSON body field "hardware_key" or, failing that,
// the "X-Hardware-Key" header. The verified JWT subject (current_identity) is
// recorded as the actor — never a client-supplied identity header.

#include "LaunchController.h"
#include "../launch/LaunchAuthority.h"

#include <drogon/HttpResponse.h>
#include <drogon/drogon.h>
#include <nlohmann/json.hpp>

#include <cstdlib>
#include <mutex>
#include <string>

namespace gnc::backend {

namespace {

drogon::HttpResponsePtr json_response(nlohmann::json body,
                                      drogon::HttpStatusCode code = drogon::k200OK)
{
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(code);
    resp->setContentTypeCode(drogon::CT_APPLICATION_JSON);
    resp->setBody(body.dump());
    return resp;
}

nlohmann::json snapshot_json(const LaunchSnapshot& s)
{
    return {
        {"state",                    to_string(s.state)},
        {"armed",                    s.armed},
        {"launched",                 s.launched},
        {"hardware_key_provisioned", s.hardware_key_provisioned},
        {"last_actor",               s.last_actor},
        {"last_action",              s.last_action},
        {"abort_reason",             s.abort_reason},
        {"updated_at_unix_s",        s.updated_at_unix_s},
    };
}

// Configure the process-global authority's hardware key exactly once, from env
// or config. Done lazily on first request so it runs after main() has loaded
// the config file.
void ensure_configured()
{
    static std::once_flag once;
    std::call_once(once, [] {
        std::string key;
        if (const char* env = std::getenv("GNC_HARDWARE_KEY"); env && *env) {
            key = env;
        } else {
            const auto& custom = drogon::app().getCustomConfig();
            if (custom.isMember("launch") && custom["launch"].isMember("hardware_key")) {
                key = custom["launch"]["hardware_key"].asString();
            }
        }
        LaunchAuthority::instance().configure(key);
    });
}

// JSON body field, else header fallback.
std::string read_field(const drogon::HttpRequestPtr& req,
                       const char* json_key, const char* header_key)
{
    if (std::string body(req->body()); !body.empty()) {
        try {
            auto j = nlohmann::json::parse(body);
            if (j.is_object() && j.contains(json_key) && j[json_key].is_string()) {
                return j[json_key].get<std::string>();
            }
        } catch (...) {
            // fall through to header
        }
    }
    return req->getHeader(header_key);
}

drogon::HttpStatusCode http_code(int code)
{
    switch (code) {
        case 200: return drogon::k200OK;
        case 403: return drogon::k403Forbidden;
        case 409: return drogon::k409Conflict;
        case 503: return drogon::k503ServiceUnavailable;
        default:  return drogon::k400BadRequest;
    }
}

drogon::HttpResponsePtr result_response(const LaunchResult& r)
{
    nlohmann::json body = snapshot_json(r.snapshot);
    body["ok"] = r.ok;
    if (!r.ok) body["error"] = r.error;
    return json_response(body, http_code(r.http_status));
}

}  // namespace

void LaunchController::state(const drogon::HttpRequestPtr&, Cb&& cb)
{
    ensure_configured();
    cb(json_response(snapshot_json(LaunchAuthority::instance().snapshot())));
}

void LaunchController::arm(const drogon::HttpRequestPtr& req, Cb&& cb)
{
    ensure_configured();
    const std::string key   = read_field(req, "hardware_key", "X-Hardware-Key");
    const std::string actor = current_identity(req).subject;
    cb(result_response(LaunchAuthority::instance().arm(key, actor)));
}

void LaunchController::launch(const drogon::HttpRequestPtr& req, Cb&& cb)
{
    ensure_configured();
    const std::string actor = current_identity(req).subject;
    cb(result_response(LaunchAuthority::instance().launch(actor)));
}

void LaunchController::abort(const drogon::HttpRequestPtr& req, Cb&& cb)
{
    ensure_configured();
    const std::string reason = read_field(req, "reason", "X-Reason");
    const std::string actor  = current_identity(req).subject;
    cb(result_response(LaunchAuthority::instance().abort(reason, actor)));
}

void LaunchController::reset(const drogon::HttpRequestPtr& req, Cb&& cb)
{
    ensure_configured();
    const std::string actor = current_identity(req).subject;
    cb(result_response(LaunchAuthority::instance().reset(actor)));
}

}  // namespace gnc::backend
