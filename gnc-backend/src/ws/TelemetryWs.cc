// gnc-backend/src/ws/TelemetryWs.cc
// Until the TCP-5900 listener is wired, this controller simply tracks
// connected clients so the frontend can establish the socket cleanly.

#include "TelemetryWs.h"

#include <mutex>
#include <set>

namespace gnc::backend {

namespace {

std::mutex g_mu;
std::set<drogon::WebSocketConnectionPtr> g_clients;

}  // namespace

void TelemetryWs::handleNewConnection(const drogon::HttpRequestPtr& /*req*/,
                                      const drogon::WebSocketConnectionPtr& conn)
{
    std::lock_guard<std::mutex> lock(g_mu);
    g_clients.insert(conn);
}

void TelemetryWs::handleNewMessage(const drogon::WebSocketConnectionPtr& /*conn*/,
                                   std::string&& /*msg*/,
                                   const drogon::WebSocketMessageType& /*type*/)
{
    // Clients are receive-only on this channel.
}

void TelemetryWs::handleConnectionClosed(const drogon::WebSocketConnectionPtr& conn)
{
    std::lock_guard<std::mutex> lock(g_mu);
    g_clients.erase(conn);
}

void TelemetryWs::broadcast_misplot(const std::uint8_t* data, std::size_t len)
{
    if (len != 77) return;  // strict per internal-system plan §5.2
    std::lock_guard<std::mutex> lock(g_mu);
    for (auto& c : g_clients) {
        if (c && c->connected()) {
            c->send(reinterpret_cast<const char*>(data), len,
                    drogon::WebSocketMessageType::Binary);
        }
    }
}

}  // namespace gnc::backend
