// gnc-backend/src/ws/HardwareWs.h
// JSON 1 Hz health pump. Emits message types per internal-system plan §5.2:
//   {type: 'ports'|'cpu'|'can'|'rescan_ack', payload: ...}

#pragma once

#include <drogon/WebSocketController.h>

namespace gnc::backend {

class HardwareWs : public drogon::WebSocketController<HardwareWs> {
public:
    void handleNewConnection(const drogon::HttpRequestPtr& req,
                             const drogon::WebSocketConnectionPtr& conn) override;
    void handleNewMessage(const drogon::WebSocketConnectionPtr& conn,
                          std::string&& msg,
                          const drogon::WebSocketMessageType& type) override;
    void handleConnectionClosed(const drogon::WebSocketConnectionPtr& conn) override;

    WS_PATH_LIST_BEGIN
        WS_PATH_ADD("/ws/hardware");
    WS_PATH_LIST_END
};

}  // namespace gnc::backend
