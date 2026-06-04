// gnc-backend/src/controllers/TemplatesController.cc
// Stream B Wave 1: list / getOne / validate are wired to the on-disk
// rockets/ folder via TemplateLoader + Validator. Mutating endpoints
// (create / patch / replace / delete / duplicate / history) still return
// 503 — they need persistence (Block 3) and multipart upload handling.

#include "TemplatesController.h"
#include "ConfigPaths.h"
#include "../parser/TemplateLoader.h"
#include "../validator/Validator.h"

#include <chrono>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <nlohmann/json.hpp>
#include <sstream>
#include <filesystem>

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

std::string iso8601_utc_now()
{
    using namespace std::chrono;
    auto now    = system_clock::now();
    auto secs   = duration_cast<seconds>(now.time_since_epoch()).count();
    std::time_t t = static_cast<std::time_t>(secs);
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

nlohmann::json diagnostics_to_json(
    const std::vector<parser::Diagnostic>& diags)
{
    nlohmann::json arr = nlohmann::json::array();
    for (const auto& d : diags) {
        const char* sev = "info";
        switch (d.severity) {
            case parser::DiagSeverity::Warning: sev = "warning"; break;
            case parser::DiagSeverity::Error:   sev = "error";   break;
            default: break;
        }
        arr.push_back({
            {"severity", sev},
            {"file", d.file},
            {"message", d.message}
        });
    }
    return arr;
}

}  // namespace

void TemplatesController::list(const drogon::HttpRequestPtr&, Cb&& cb)
{
    parser::TemplateLoader loader(rockets_root());
    cb(json_response(loader.list_summary()));
}

void TemplatesController::create(const drogon::HttpRequestPtr&, Cb&& cb)
{
    // TODO[Block 3]: multipart upload -> stage to tmp dir -> parse -> validate
    //                -> persist via DB, then publish to rockets/ tree.
    cb(json_response({
        {"template_id", nullptr},
        {"_stub", true},
        {"msg", "POST /templates not yet implemented (Block 3 persistence)"}
    }, drogon::k503ServiceUnavailable));
}

void TemplatesController::getOne(const drogon::HttpRequestPtr&, Cb&& cb,
                                 std::string id)
{
    parser::TemplateLoader loader(rockets_root());
    auto result = loader.load(id);
    if (!result.ok) {
        return cb(json_response({
            {"template_id", id},
            {"error", "template not found or failed to parse"},
            {"diagnostics", diagnostics_to_json(result.diagnostics)}
        }, drogon::k404NotFound));
    }
    nlohmann::json body = result.data;
    body["diagnostics"] = diagnostics_to_json(result.diagnostics);
    cb(json_response(body));
}

void TemplatesController::patchOne(const drogon::HttpRequestPtr&, Cb&& cb,
                                   std::string id)
{
    cb(json_response({{"template_id", id}, {"_stub", true},
                      {"msg", "PATCH not yet implemented (Block 3)"}},
                     drogon::k503ServiceUnavailable));
}

void TemplatesController::replace(const drogon::HttpRequestPtr&, Cb&& cb,
                                  std::string id)
{
    cb(json_response({{"template_id", id}, {"_stub", true},
                      {"msg", "PUT not yet implemented (Block 3)"}},
                     drogon::k503ServiceUnavailable));
}

void TemplatesController::remove(const drogon::HttpRequestPtr&, Cb&& cb,
                                 std::string id)
{
    cb(json_response({{"template_id", id}, {"deleted", false}, {"_stub", true},
                      {"msg", "DELETE not yet implemented (Block 3)"}},
                     drogon::k503ServiceUnavailable));
}

void TemplatesController::validate(const drogon::HttpRequestPtr&, Cb&& cb,
                                   std::string id)
{
    parser::TemplateLoader loader(rockets_root());
    auto result = loader.load(id);
    if (!result.ok) {
        return cb(json_response({
            {"template_id", id},
            {"error", "template not found or failed to parse"},
            {"diagnostics", diagnostics_to_json(result.diagnostics)}
        }, drogon::k404NotFound));
    }
    auto report = validator::run_all(result.data);
    report.run_at = iso8601_utc_now();

    nlohmann::json body = validator::to_json(report);
    body["template_id"] = id;
    body["diagnostics"] = diagnostics_to_json(result.diagnostics);
    cb(json_response(body));
}

void TemplatesController::duplicate(const drogon::HttpRequestPtr&, Cb&& cb,
                                    std::string id)
{
    cb(json_response({{"template_id", id + "_copy"}, {"_stub", true},
                      {"msg", "duplicate not yet implemented (Block 3)"}},
                     drogon::k503ServiceUnavailable));
}

void TemplatesController::history(const drogon::HttpRequestPtr&, Cb&& cb,
                                  std::string id)
{
    // Pulls every audit_log entry with (target_kind=template, target_id=id).
    // Once libpqxx is wired this becomes a SELECT against audit_log; until
    // then we read the JSONL audit file.
    const std::string audit_path =
        config_path("audit_log_path", "./var/audit.jsonl");

    nlohmann::json out = nlohmann::json::array();
    std::ifstream f(audit_path);
    if (!f) return cb(json_response(out));   // no history yet

    std::string line;
    while (std::getline(f, line)) {
        if (line.empty()) continue;
        try {
            auto e = nlohmann::json::parse(line);
            if (e.value("target_kind", "") != "template") continue;
            if (e.value("target_id",   "") != id)         continue;
            out.push_back(std::move(e));
        } catch (...) {}
    }
    cb(json_response(out));
}

void TemplatesController::getCad(const drogon::HttpRequestPtr&, Cb&& cb, std::string id)
{
    std::filesystem::path folder = rockets_root() / id;
    if (!std::filesystem::exists(folder)) {
        auto resp = drogon::HttpResponse::newHttpResponse();
        resp->setStatusCode(drogon::k404NotFound);
        return cb(resp);
    }
    
    for (const auto& entry : std::filesystem::directory_iterator(folder)) {
        if (entry.is_regular_file()) {
            std::string ext = entry.path().extension().string();
            std::transform(ext.begin(), ext.end(), ext.begin(), ::tolower);
            if (ext == ".glb" || ext == ".gltf") {
                auto resp = drogon::HttpResponse::newFileResponse(entry.path().string());
                return cb(resp);
            }
        }
    }
    auto resp = drogon::HttpResponse::newHttpResponse();
    resp->setStatusCode(drogon::k404NotFound);
    cb(resp);
}

}  // namespace gnc::backend
