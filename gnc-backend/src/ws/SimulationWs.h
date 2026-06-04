// gnc-backend/src/ws/SimulationWs.h
// Per-run WebSocket that emits binary sim frames produced by the in-process
// simulation engine. URL path: /ws/simulation/{}.

#pragma once

#include <drogon/WebSocketController.h>

namespace gnc::backend {

class SimulationWs : public drogon::WebSocketController<SimulationWs> {
public:
    void handleNewConnection(const drogon::HttpRequestPtr& req,
                             const drogon::WebSocketConnectionPtr& conn) override;
    void handleNewMessage(const drogon::WebSocketConnectionPtr& conn,
                          std::string&& msg,
                          const drogon::WebSocketMessageType& type) override;
    void handleConnectionClosed(const drogon::WebSocketConnectionPtr& conn) override;

    WS_PATH_LIST_BEGIN
        WS_PATH_ADD("/ws/simulation");
    WS_PATH_LIST_END
};

}  // namespace gnc::backend
