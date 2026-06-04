// gnc-backend/src/ws/SimulationWs.cc
// Routes /ws/simulation/{runId} into the SimRunRegistry. The registry's
// SimRun owns the sim thread and pushes frames to every attached connection.

#include "SimulationWs.h"
#include "../sim/SimRunRegistry.h"

#include <drogon/HttpRequest.h>
#include <nlohmann/json.hpp>

#include <string>

namespace gnc::backend {

namespace {

// Extracts the trailing path segment from `/ws/simulation/<runId>`.
// Cheaper and more portable than relying on drogon's routing-args API.
std::string extract_run_id(const drogon::HttpRequestPtr& req) {
    return req->getParameter("runId");
}

}  // namespace

void SimulationWs::handleNewConnection(const drogon::HttpRequestPtr& req,
                                       const drogon::WebSocketConnectionPtr& conn)
{
    const auto run_id = extract_run_id(req);
    if (run_id.empty()) {
        nlohmann::json err = {{"type", "error"},
                              {"message", "runId missing in path"}};
        conn->send(err.dump(), drogon::WebSocketMessageType::Text);
        conn->shutdown(drogon::CloseCode::kInvalidMessage, "missing runId");
        return;
    }

    if (!sim::SimRunRegistry::instance().attach(run_id, conn)) {
        nlohmann::json err = {{"type", "error"},
                              {"message", "unknown runId"},
                              {"runId", run_id}};
        conn->send(err.dump(), drogon::WebSocketMessageType::Text);
        conn->shutdown(drogon::CloseCode::kInvalidMessage, "unknown runId");
        return;
    }

    // Stash the runId so handleConnectionClosed can detach without re-parsing.
    conn->setContext(std::make_shared<std::string>(run_id));

    nlohmann::json hello = {{"type", "subscribed"}, {"runId", run_id}};
    conn->send(hello.dump(), drogon::WebSocketMessageType::Text);
}

void SimulationWs::handleNewMessage(const drogon::WebSocketConnectionPtr& conn,
                                    std::string&& msg,
                                    const drogon::WebSocketMessageType& /*type*/)
{
    // Optional control messages from the FE (pause / resume / abort).
    try {
        auto parsed = nlohmann::json::parse(msg);
        const auto t = parsed.value("type", "");
        if (t == "abort") {
            if (auto ctx = conn->getContext<std::string>()) {
                sim::SimRunRegistry::instance().stop(*ctx);
            }
        }
    } catch (...) {
        // ignore malformed
    }
}

void SimulationWs::handleConnectionClosed(const drogon::WebSocketConnectionPtr& conn)
{
    auto ctx = conn->getContext<std::string>();
    if (!ctx) return;
    sim::SimRunRegistry::instance().detach(*ctx, conn);
    sim::SimRunRegistry::instance().gc();
}

}  // namespace gnc::backend
