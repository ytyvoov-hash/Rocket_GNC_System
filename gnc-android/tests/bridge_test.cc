// gnc-android/tests/bridge_test.cc
//
// v8 P5.2. Host regression for the Path A substrate: USB-CDC framing + CRC,
// message (de)serialisation round-trips, and a closed Android-side outer-loop
// step over the link (loopback transport) on the estimated state (INV-3). Runs
// on the host so CI exercises the exact native control flow the phone runs.

#include <catch2/catch_test_macros.hpp>

#include "gnc-android/UsbCdcLink.h"
#include "gnc-android/GncBridge.h"
#include "gnc-core/control/ControllerFactory.h"

#include <cmath>
#include <deque>

using namespace gnc;
using namespace gnc::android;

namespace {

// In-memory loopback: whatever is written can be read back (one shared FIFO).
class LoopbackTransport : public ITransport {
public:
    std::size_t write(const std::uint8_t* d, std::size_t n) override {
        for (std::size_t i = 0; i < n; ++i) fifo_.push_back(d[i]);
        return n;
    }
    std::size_t read(std::uint8_t* out, std::size_t cap) override {
        std::size_t i = 0;
        while (i < cap && !fifo_.empty()) { out[i++] = fifo_.front(); fifo_.pop_front(); }
        return i;
    }
    std::deque<std::uint8_t> fifo_;
};

std::tuple<std::shared_ptr<control::IController>, std::shared_ptr<control::IControlAllocator>>
make_pid() {
    TuningParams tp;
    tp.algorithm = "PID"; tp.controller_type = "fins";
    tp.kp = 4.0; tp.ki = 0.0; tp.kd = 2.0;
    tp.n_fins = 4; tp.fin_layout = "cruciform";
    tp.Cm_delta = 0.5; tp.Cn_delta = 0.5; tp.Cl_delta = 0.01;
    return control::ControllerFactory::create(tp);
}

SensorMsg sample_sensor(std::int64_t t_ns) {
    SensorMsg s;
    s.t_ns = t_ns;
    s.acc_b[2] = -9.80665f;  // sitting on the pad, +z down
    s.imu_valid = 1;
    s.gps_valid = 1;
    s.alt = 100.0;
    return s;
}

}  // namespace

// ---------------------------------------------------------------------------
// CRC-16/CCITT-FALSE known answer (check value for "123456789" == 0x29B1).
// ---------------------------------------------------------------------------
TEST_CASE("crc16-ccitt-false known answer", "[link]") {
    const char* s = "123456789";
    REQUIRE(crc16_ccitt(reinterpret_cast<const std::uint8_t*>(s), 9) == 0x29B1);
}

// ---------------------------------------------------------------------------
// Message (de)serialise round-trips.
// ---------------------------------------------------------------------------
TEST_CASE("message round-trips", "[link]") {
    SensorMsg s = sample_sensor(123456789);
    s.gyro_b[1] = 0.25f; s.lat = 51.5; s.lon = -0.12; s.vel_n[0] = 3.5f;
    auto sb = s.serialize();
    SensorMsg s2;
    REQUIRE(SensorMsg::deserialize(sb.data(), sb.size(), s2));
    REQUIRE(s2.t_ns == s.t_ns);
    REQUIRE(s2.gyro_b[1] == s.gyro_b[1]);
    REQUIRE(s2.lat == s.lat);
    REQUIRE(s2.vel_n[0] == s.vel_n[0]);

    CommandMsg c; c.n_fins = 4; c.fin_cmd_rad[2] = -0.05f; c.target_euler[1] = 1.57f; c.mode = 2;
    auto cb = c.serialize();
    CommandMsg c2;
    REQUIRE(CommandMsg::deserialize(cb.data(), cb.size(), c2));
    REQUIRE(c2.n_fins == 4);
    REQUIRE(c2.fin_cmd_rad[2] == c.fin_cmd_rad[2]);
    REQUIRE(c2.mode == 2);

    // Wrong-length payloads are rejected.
    REQUIRE_FALSE(SensorMsg::deserialize(sb.data(), sb.size() - 1, s2));
}

// ---------------------------------------------------------------------------
// Framing over the loopback: encode -> wire -> decode yields the same message.
// ---------------------------------------------------------------------------
TEST_CASE("usb-cdc frame round-trip over loopback", "[link]") {
    LoopbackTransport t;
    UsbCdcLink link(t);

    SensorMsg s = sample_sensor(42);
    s.acc_b[0] = 0.126f;  // a value whose bytes can include 0x7E/0x7D -> exercises stuffing
    REQUIRE(link.send_sensor(s));

    auto frames = link.poll();
    REQUIRE(frames.size() == 1);
    REQUIRE(frames[0].id == MsgId::Sensor);
    SensorMsg got;
    REQUIRE(SensorMsg::deserialize(frames[0].payload.data(), frames[0].payload.size(), got));
    REQUIRE(got.t_ns == 42);
    REQUIRE(got.acc_b[0] == s.acc_b[0]);
    REQUIRE(link.crc_errors() == 0);
}

// ---------------------------------------------------------------------------
// A corrupted frame is dropped (CRC mismatch), not delivered.
// ---------------------------------------------------------------------------
TEST_CASE("corrupted frame rejected by crc", "[link]") {
    SensorMsg s = sample_sensor(7);
    auto frame = frame_encode(MsgId::Sensor, s.serialize().data(), s.serialize().size());
    // Flip a payload byte (index 3 is safely inside the body, not a delimiter).
    frame[3] ^= 0xFF;

    LoopbackTransport t;
    UsbCdcLink link(t);
    t.write(frame.data(), frame.size());
    auto frames = link.poll();
    REQUIRE(frames.empty());
    REQUIRE(link.crc_errors() == 1);
}

// ---------------------------------------------------------------------------
// Closed Android-side outer loop over the link (INV-3, estimated state).
// L431 (loopback) emits SENSOR; bridge fuses + controls; emits COMMAND back.
// ---------------------------------------------------------------------------
TEST_CASE("path-a closed outer loop over link", "[bridge]") {
    LoopbackTransport up;    // L431 -> Android
    LoopbackTransport down;  // Android -> L431
    UsbCdcLink l431(up);
    UsbCdcLink phone_rx(up);
    UsbCdcLink phone_tx(down);

    auto [ctrl, alloc] = make_pid();
    GncBridge bridge(BridgeConfig{}, ctrl, alloc);

    CommandMsg last_cmd;
    bool got_cmd = false;
    for (int k = 0; k < 20; ++k) {
        // L431 publishes a sensor snapshot at 100 Hz (10 ms steps).
        l431.send_sensor(sample_sensor(static_cast<std::int64_t>(k) * 10'000'000));
        // Android reads it, runs the outer loop, sends a command back.
        for (auto& f : phone_rx.poll()) {
            if (f.id != MsgId::Sensor) continue;
            SensorMsg s;
            REQUIRE(SensorMsg::deserialize(f.payload.data(), f.payload.size(), s));
            const CommandMsg cmd = bridge.step(s, /*armed=*/true);
            phone_tx.send_command(cmd);
        }
    }
    // L431 receives commands from the phone.
    for (auto& f : UsbCdcLink(down).poll()) {
        if (f.id == MsgId::Command) {
            REQUIRE(CommandMsg::deserialize(f.payload.data(), f.payload.size(), last_cmd));
            got_cmd = true;
        }
    }

    REQUIRE(got_cmd);
    REQUIRE(bridge.telemetry().nav_valid);
    REQUIRE_FALSE(bridge.diverged());
    REQUIRE(last_cmd.n_fins == 4);
    REQUIRE(last_cmd.mode == static_cast<std::uint8_t>(LinkMode::Flight));
    for (int i = 0; i < last_cmd.n_fins; ++i) REQUIRE(std::isfinite(last_cmd.fin_cmd_rad[i]));
}
