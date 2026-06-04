// gnc-backend/src/ws/HardwareWs.cc
//
// 1 Hz pump for the FE Hardware Health screen + S13a Routing Manager.
// Three message types are emitted:
//   • {type:"cpu",  payload:{temp,loadPct,heapFreeKb}}
//   • {type:"can",  payload:{utilPct}}
//   • {type:"ports",payload:[HardwarePort,…]}
//
// "ports" comes from `hal::native::enumerate_usb_serial_ports()` overlaid
// with the saved assignments file — same source as `GET /api/v1/hardware/scan`,
// so the FE never sees two different answers. To keep CPU low we cache the
// last enumeration and only re-scan every `kPortsScanIntervalSec` seconds
// or on an explicit `rescan_request` from a client.

#include "HardwareWs.h"

#include <drogon/drogon.h>
#include <nlohmann/json.hpp>

#include "gnc-core/hal/HalFactory.h"
#include "../hal/native/UsbScan.h"
#include "../controllers/ConfigPaths.h"

#include <atomic>
#include <chrono>
#include <fstream>
#include <mutex>
#include <set>
#include <thread>

namespace gnc::backend {

// Forward declaration from main.cc
const gnc::hal::HalSet& get_hal_set();

namespace {

constexpr int kPortsScanIntervalSec = 5;

std::mutex                                  g_mu;
std::set<drogon::WebSocketConnectionPtr>    g_clients;
std::atomic<bool>                           g_pump_started{false};
std::atomic<bool>                           g_rescan_requested{false};

std::mutex                                  g_ports_mu;
nlohmann::json                              g_last_ports = nlohmann::json::array();
std::chrono::steady_clock::time_point       g_last_scan_at{};

void send_to_all(const nlohmann::json& msg)
{
    auto str = msg.dump();
    std::lock_guard<std::mutex> lock(g_mu);
    for (auto& c : g_clients) {
        if (c && c->connected()) {
            c->send(str, drogon::WebSocketMessageType::Text);
        }
    }
}

void send_to_one(const drogon::WebSocketConnectionPtr& conn,
                 const nlohmann::json& msg)
{
    if (conn && conn->connected()) {
        conn->send(msg.dump(), drogon::WebSocketMessageType::Text);
    }
}

nlohmann::json read_assignments_or_null()
{
    std::ifstream f(device_assignments_path());
    if (!f) return nullptr;
    try {
        return nlohmann::json::parse(f);
    } catch (...) {
        return nullptr;
    }
}

// Performs a fresh USB enumeration, overlays saved assignments, and
// updates the cached `g_last_ports` / `g_last_scan_at`.
nlohmann::json refresh_ports_now()
{
    auto ports       = hal::native::enumerate_usb_serial_ports();
    auto assignments = read_assignments_or_null();
    auto wire        = hal::native::to_wire_json(ports, assignments);

    std::lock_guard<std::mutex> lock(g_ports_mu);
    g_last_ports   = wire;
    g_last_scan_at = std::chrono::steady_clock::now();
    return wire;
}

nlohmann::json get_or_refresh_ports()
{
    using clock = std::chrono::steady_clock;
    {
        std::lock_guard<std::mutex> lock(g_ports_mu);
        if (!g_last_ports.empty() &&
            (clock::now() - g_last_scan_at) <
                std::chrono::seconds(kPortsScanIntervalSec)) {
            return g_last_ports;
        }
    }
    return refresh_ports_now();
}

void ensure_pump_started()
{
    bool expected = false;
    if (!g_pump_started.compare_exchange_strong(expected, true)) return;

    // 1 Hz pump per §6.5 / S13 status bar.
    std::thread([] {
        int tick = 0;
        while (true) {
            std::this_thread::sleep_for(std::chrono::seconds(1));
            ++tick;

            const auto& hal = get_hal_set();

            // CPU thermal sample.
            if (hal.thermal) {
                auto s = hal.thermal->sample();
                send_to_all({{"type", "cpu"},
                             {"payload", {{"temp",       s.cpu_temp_c},
                                          {"loadPct",    s.cpu_load_pct},
                                          {"heapFreeKb", s.heap_free_kb}}}});
            } else {
                send_to_all({{"type", "cpu"},
                             {"payload", {{"temp",       nullptr},
                                          {"loadPct",    nullptr},
                                          {"heapFreeKb", nullptr}}}});
            }

            // CAN utilisation.
            const double util = hal.can ? hal.can->utilisation_pct() : 0.0;
            send_to_all({{"type", "can"},
                         {"payload", {{"utilPct", util}}}});

            // Ports — re-enumerate every kPortsScanIntervalSec seconds OR
            // on demand. SetupDi enumeration is cheap (<10 ms) but we
            // throttle to keep this thread's CPU footprint negligible.
            const bool due_for_scan = (tick % kPortsScanIntervalSec) == 0;
            const bool on_demand    = g_rescan_requested.exchange(false);
            if (due_for_scan || on_demand) {
                auto ports = refresh_ports_now();
                send_to_all({{"type", "ports"}, {"payload", ports}});
            }
        }
    }).detach();
}

}  // namespace

void HardwareWs::handleNewConnection(const drogon::HttpRequestPtr& /*req*/,
                                     const drogon::WebSocketConnectionPtr& conn)
{
    {
        std::lock_guard<std::mutex> lock(g_mu);
        g_clients.insert(conn);
    }
    ensure_pump_started();

    // Seed the new client with the current ports list immediately so the
    // FE doesn't have to wait up to kPortsScanIntervalSec for the first
    // frame. If the cache is stale or empty, refresh it inline.
    auto ports = get_or_refresh_ports();
    send_to_one(conn, {{"type", "ports"}, {"payload", ports}});
}

void HardwareWs::handleNewMessage(const drogon::WebSocketConnectionPtr& conn,
                                  std::string&& msg,
                                  const drogon::WebSocketMessageType& /*type*/)
{
    try {
        auto parsed = nlohmann::json::parse(msg);
        const auto t = parsed.value("type", "");
        if (t == "rescan_request") {
            // Run the scan synchronously on this thread (cheap on Windows)
            // so we can ack with the real device count, then ask the pump
            // to re-broadcast on its next tick.
            auto ports = refresh_ports_now();
            g_rescan_requested = true;

            // Push the new ports list to every client right away.
            send_to_all({{"type", "ports"}, {"payload", ports}});

            // Personal ack with the count for the requester.
            send_to_one(conn, {{"type", "rescan_ack"},
                               {"payload", {{"ok",    true},
                                            {"count", ports.size()}}}});
        }
    } catch (...) {
        // ignore malformed
    }
}

void HardwareWs::handleConnectionClosed(const drogon::WebSocketConnectionPtr& conn)
{
    std::lock_guard<std::mutex> lock(g_mu);
    g_clients.erase(conn);
}

}  // namespace gnc::backend
