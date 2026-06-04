// gnc-backend/src/controllers/AuditController.cc
// Reads from the JSONL audit log written by audit::JsonlAuditWriter. Once
// libpqxx is wired this is replaced with `SELECT … FROM audit_log`.
//
// Query parameters:
//   ?limit  (default 100, max 1000)
//   ?actor  (substring match)
//   ?target_kind, ?target_id   (exact match)
//   ?since  (ISO-8601, lexicographic compare on 'at')

#include "AuditController.h"
#include "ConfigPaths.h"

#include <nlohmann/json.hpp>

#include <algorithm>
#include <deque>
#include <fstream>
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

bool matches(const nlohmann::json& e,
             const std::string& actor,
             const std::string& target_kind,
             const std::string& target_id,
             const std::string& since)
{
    if (!actor.empty()) {
        const auto a = e.value("actor", "");
        if (a.find(actor) == std::string::npos) return false;
    }
    if (!target_kind.empty()) {
        if (e.value("target_kind", "") != target_kind) return false;
    }
    if (!target_id.empty()) {
        if (e.value("target_id", "") != target_id) return false;
    }
    if (!since.empty()) {
        if (e.value("at", "") < since) return false;
    }
    return true;
}

}  // namespace

void AuditController::list(const drogon::HttpRequestPtr& req, Cb&& cb)
{
    int limit = 100;
    try {
        const auto s = req->getParameter("limit");
        if (!s.empty()) limit = std::min(std::max(std::stoi(s), 1), 1000);
    } catch (...) {}

    const auto actor       = req->getParameter("actor");
    const auto target_kind = req->getParameter("target_kind");
    const auto target_id   = req->getParameter("target_id");
    const auto since       = req->getParameter("since");

    const std::string path =
        config_path("audit_log_path", "./var/audit.jsonl");

    nlohmann::json entries = nlohmann::json::array();
    std::ifstream f(path);
    if (!f) {
        return cb(json_response({
            {"entries", entries},
            {"total",   0},
            {"path",    path},
            {"note",    "audit log not yet present"}
        }));
    }

    // Tail-N pattern: keep a sliding window of the last `limit` matches.
    std::deque<nlohmann::json> window;
    std::string line;
    std::size_t total_seen = 0;
    while (std::getline(f, line)) {
        if (line.empty()) continue;
        try {
            auto e = nlohmann::json::parse(line);
            if (!matches(e, actor, target_kind, target_id, since)) continue;
            ++total_seen;
            window.push_back(std::move(e));
            if (static_cast<int>(window.size()) > limit) window.pop_front();
        } catch (...) {
            // Skip malformed lines silently.
        }
    }

    for (auto& e : window) entries.push_back(std::move(e));

    cb(json_response({
        {"entries", entries},
        {"returned", entries.size()},
        {"total_matched", total_seen},
        {"limit", limit},
        {"path",  path}
    }));
}

}  // namespace gnc::backend
