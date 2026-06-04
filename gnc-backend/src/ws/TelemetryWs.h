// gnc-backend/src/ws/TelemetryWs.h
// WebSocket bridge that re-emits MisPlot 77-byte frames received from the
// flight computer over TCP-5900 (v5.4 §7.3.9) to every connected GCS client.
// Frame layout is byte-exact; see internal-system plan §5.2.

#pragma once

#include <drogon/WebSocketController.h>

namespace gnc::backend {

class TelemetryWs : public drogon::WebSocketController<TelemetryWs> {
public:
    void handleNewConnection(const drogon::HttpRequestPtr& req,
                             const drogon::WebSocketConnectionPtr& conn) override;
    void handleNewMessage(const drogon::WebSocketConnectionPtr& conn,
                          std::string&& msg,
                          const drogon::WebSocketMessageType& type) override;
    void handleConnectionClosed(const drogon::WebSocketConnectionPtr& conn) override;

    WS_PATH_LIST_BEGIN
        WS_PATH_ADD("/ws/telemetry");
    WS_PATH_LIST_END

    // Broadcast a 77-byte MisPlot frame to every active subscriber. Called by
    // the (future) TCP-5900 listener.
    static void broadcast_misplot(const std::uint8_t* data, std::size_t len);
};

}  // namespace gnc::backend
