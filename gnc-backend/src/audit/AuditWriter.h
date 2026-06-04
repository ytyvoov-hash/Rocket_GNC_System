// gnc-backend/src/audit/AuditWriter.h
//
// Block 3 — append-only audit log.
//
// The DB-backed writer (libpqxx → INSERT INTO audit_log) is the long-term
// home; until libpqxx is wired into the executable, the JSONL writer below
// is the active implementation. Both satisfy the same `IAuditWriter`
// interface so the swap is a one-line change in `main.cc`.
//
// Threading: writes are serialised by a single std::mutex inside the JSONL
// implementation. Throughput is sufficient for the < 100 mutating-RPS the
// backend is expected to serve.

#pragma once

#include <drogon/HttpRequest.h>
#include <drogon/HttpResponse.h>

#include <filesystem>
#include <memory>
#include <mutex>
#include <string>

namespace gnc::backend::audit {

// Captured at request-receipt time.
struct AuditEntry {
    std::string at_iso8601;       // populated by the writer if empty
    std::string actor;            // Keycloak preferred_username, or "dev"
    std::string actor_role;       // viewer|engineer|operator|admin
    std::string operator_id;      // X-Operator-ID header (may be empty)
    std::string reason;           // X-Reason header (may be empty)
    std::string method;           // GET/POST/PUT/PATCH/DELETE
    std::string path;
    int         status{0};
    std::string target_kind;      // template|mission|hardware|library|run
    std::string target_id;
    std::string diff_json;        // either a real diff or the request body
    std::string request_id;
    std::string client_ip;
};

class IAuditWriter {
public:
    virtual ~IAuditWriter() = default;
    virtual void write(const AuditEntry& e) = 0;
};

// JSONL implementation. One JSON object per line; safe to tail -F.
// File path defaults to ./var/audit.jsonl and the parent dir is created
// on first write. fsync is called per line so a SIGKILL never loses an
// already-acknowledged audit entry.
class JsonlAuditWriter final : public IAuditWriter {
public:
    explicit JsonlAuditWriter(std::filesystem::path log_path);
    void write(const AuditEntry& e) override;

private:
    std::filesystem::path path_;
    std::mutex            mu_;
};

// Process-wide accessors. main.cc installs the writer once at boot.
void           install(std::shared_ptr<IAuditWriter> writer);
IAuditWriter*  current();

// Hook used by main.cc's registerPostHandlingAdvice. Inspects the
// request/response, builds an AuditEntry for mutating methods, writes it.
void on_response(const drogon::HttpRequestPtr& req,
                 const drogon::HttpResponsePtr& resp);

}  // namespace gnc::backend::audit
