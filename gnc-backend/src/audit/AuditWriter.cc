// gnc-backend/src/audit/AuditWriter.cc

#include "AuditWriter.h"
#include "../auth/KeycloakAuth.h"

#include <nlohmann/json.hpp>

#include <chrono>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <memory>
#include <regex>
#include <sstream>

namespace gnc::backend::audit {

namespace {

std::shared_ptr<IAuditWriter> g_writer;

std::string iso8601_utc_now()
{
    using namespace std::chrono;
    auto t  = system_clock::to_time_t(system_clock::now());
    std::tm tm{};
#if defined(_WIN32)
    gmtime_s(&tm, &t);
#else
    gmtime_r(&t, &tm);
#endif
    std::ostringstream oss;
    oss << std::put_time(&tm, "%Y-%m-%dT%H:%M:%SZ");
    return oss.str();
}

bool is_mutating(const std::string& method)
{
    return method == "POST" || method == "PUT" ||
           method == "PATCH" || method == "DELETE";
}

// Crude (kind, id) inference from the URL path so we can index audits by
// resource without coupling the audit writer to controller internals.
//   /api/v1/templates/BA           -> ("template",  "BA")
//   /api/v1/templates              -> ("template",  "")
//   /api/v1/missions/M-1/lock      -> ("mission",   "M-1")
//   /api/v1/hardware/assignments   -> ("hardware",  "assignments")
//   /api/v1/libraries/actuators    -> ("library",   "actuators")
//   /api/v1/simulation/start       -> ("run",       "")
//   /api/v1/simulation/{id}/stop   -> ("run",       "{id}")
void infer_target(const std::string& path,
                  std::string& kind, std::string& id)
{
    static const std::regex re_tpl   (R"(/api/v1/templates(?:/([^/]+))?)");
    static const std::regex re_msn   (R"(/api/v1/missions(?:/([^/]+))?)");
    static const std::regex re_hw    (R"(/api/v1/hardware/([^/]+))");
    static const std::regex re_lib   (R"(/api/v1/libraries/([^/]+))");
    static const std::regex re_simS  (R"(/api/v1/simulation/start)");
    static const std::regex re_simS2 (R"(/api/v1/simulation/([^/]+)/stop)");
    static const std::regex re_launch(R"(/api/v1/launch/([^/]+))");
    std::smatch m;
    if (std::regex_search(path, m, re_launch)) { kind = "launch"; id = m[1]; return; }
    if (std::regex_search(path, m, re_simS2)) { kind = "run";      id = m[1]; return; }
    if (std::regex_search(path, m, re_simS )) { kind = "run";      id = "";   return; }
    if (std::regex_search(path, m, re_tpl  )) { kind = "template"; id = m[1]; return; }
    if (std::regex_search(path, m, re_msn  )) { kind = "mission";  id = m[1]; return; }
    if (std::regex_search(path, m, re_hw   )) { kind = "hardware"; id = m[1]; return; }
    if (std::regex_search(path, m, re_lib  )) { kind = "library";  id = m[1]; return; }
    kind = "";  id = "";
}

}  // namespace

// ===========================================================================
// JsonlAuditWriter
// ===========================================================================
JsonlAuditWriter::JsonlAuditWriter(std::filesystem::path log_path)
    : path_(std::move(log_path))
{
    if (path_.has_parent_path()) {
        std::error_code ec;
        std::filesystem::create_directories(path_.parent_path(), ec);
    }
}

void JsonlAuditWriter::write(const AuditEntry& e)
{
    nlohmann::json j = {
        {"at",          e.at_iso8601.empty() ? iso8601_utc_now() : e.at_iso8601},
        {"actor",       e.actor},
        {"actor_role",  e.actor_role},
        {"operator_id", e.operator_id},
        {"reason",      e.reason},
        {"method",      e.method},
        {"path",        e.path},
        {"status",      e.status},
        {"target_kind", e.target_kind},
        {"target_id",   e.target_id},
        {"request_id",  e.request_id},
        {"client_ip",   e.client_ip}
    };
    if (!e.diff_json.empty()) {
        try {
            j["diff"] = nlohmann::json::parse(e.diff_json);
        } catch (...) {
            j["diff_raw"] = e.diff_json;
        }
    }

    std::lock_guard<std::mutex> lock(mu_);
    std::ofstream f(path_, std::ios::app);
    if (!f) return;
    f << j.dump() << '\n';
    f.flush();
}

// ===========================================================================
// Singletons + Drogon hook
// ===========================================================================
void install(std::shared_ptr<IAuditWriter> writer)
{
    g_writer = std::move(writer);
}

IAuditWriter* current()
{
    return g_writer.get();
}

void on_response(const drogon::HttpRequestPtr& req,
                 const drogon::HttpResponsePtr& resp)
{
    if (!g_writer) return;

    const auto method = req->methodString();
    if (!is_mutating(method)) return;

    AuditEntry e;
    e.at_iso8601  = iso8601_utc_now();
    e.method      = method;
    e.path        = req->getPath();
    e.status      = static_cast<int>(resp->getStatusCode());
    // Identity comes from the signature-verified JWT (v8 INV-2), never from a
    // client-supplied header — otherwise the audit trail itself is spoofable.
    const Identity id = current_identity(req);
    e.actor       = id.subject.empty() ? std::string("anonymous") : id.subject;
    e.actor_role  = to_string(id.role);
    e.operator_id = req->getHeader("X-Operator-ID");
    e.reason      = req->getHeader("X-Reason");
    e.request_id  = req->getHeader("X-Request-Id");
    e.client_ip   = req->getPeerAddr().toIp();

    infer_target(e.path, e.target_kind, e.target_id);

    // Capture body for diff. Cap at 64 KiB so a malicious upload can't bloat
    // the audit log; truncated bodies still preserve forensic value.
    constexpr std::size_t kMaxBody = 64 * 1024;
    auto body = std::string(req->body());
    if (body.size() > kMaxBody) body.resize(kMaxBody);
    e.diff_json = std::move(body);

    g_writer->write(e);
}

}  // namespace gnc::backend::audit
