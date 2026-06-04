// gnc-backend/src/main.cc
// Drogon app bootstrap. All REST controllers and WebSocket channels are
// auto-registered via the DROGON METHOD_LIST macros — no manual route table.

#include <drogon/drogon.h>
#include <iostream>
#include <memory>

#include "gnc-core/hal/HalFactory.h"
#include "hal/native/HalFactories.h"
#include "audit/AuditWriter.h"

namespace {
    gnc::hal::HalSet g_hal_set;
}

namespace gnc::backend {

const gnc::hal::HalSet& get_hal_set()
{
    return g_hal_set;
}

}  // namespace gnc::backend

int main(int argc, char* argv[])
{
    // ----------------------------------------------------------------
    // Register native Windows HAL implementations before building HAL stack.
    // ----------------------------------------------------------------
    gnc::backend::hal::native::register_native_factories();

    // ----------------------------------------------------------------
    // Initialise the HAL stack (stub by default; native overrides will be
    // registered by future modules linked in via gnc-bench / gnc-flight).
    // The backend never sets flight_build = true.
    // ----------------------------------------------------------------
    g_hal_set = gnc::hal::build_default(/*flight_build=*/false);
    std::cout << "[gnc-backend] HAL stack ready (any_stubbed="
              << (g_hal_set.any_stubbed ? "true" : "false") << ")" << std::endl;

    // ----------------------------------------------------------------
    // Drogon config + run loop.
    // ----------------------------------------------------------------
    const std::string config_path = (argc > 1) ? argv[1] : "config/dev.json";
    std::cout << "[gnc-backend] Loading config: " << config_path << std::endl;

    drogon::app().loadConfigFile(config_path);

    // ----------------------------------------------------------------
    // Audit log (Block 3). JSONL writer is the active implementation
    // until libpqxx is wired; the path is resolved from config.custom
    // .audit_log_path with a sensible default.
    // ----------------------------------------------------------------
    {
        const auto& custom = drogon::app().getCustomConfig();
        std::string audit_path = custom.isMember("audit_log_path")
            ? custom["audit_log_path"].asString()
            : "./var/audit.jsonl";
        gnc::backend::audit::install(
            std::make_shared<gnc::backend::audit::JsonlAuditWriter>(audit_path));
        std::cout << "[gnc-backend] Audit log: " << audit_path << std::endl;
    }

    // CORS for the FE dev server (Vite at :5173) + audit hook for every
    // mutating REST call. Both run after the response is built but before
    // it ships to the wire.
    drogon::app().registerPostHandlingAdvice(
        [](const drogon::HttpRequestPtr& req,
           const drogon::HttpResponsePtr& resp) {
            resp->addHeader("Access-Control-Allow-Origin", "*");
            resp->addHeader("Access-Control-Allow-Methods",
                            "GET, POST, PUT, PATCH, DELETE, OPTIONS");
            resp->addHeader("Access-Control-Allow-Headers",
                            "Content-Type, Authorization, X-Operator-ID, X-Reason");
            gnc::backend::audit::on_response(req, resp);
        });

    std::cout << "[gnc-backend] Starting Drogon on port 8080..." << std::endl;
    drogon::app().run();
    return 0;
}
