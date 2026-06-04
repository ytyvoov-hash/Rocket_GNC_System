// gnc-android/Messages.h
//
// v8 P5.2. Wire messages for the Android <-> STM32L431 USB-CDC link (Path A),
// per docs/path_a_link_icd.md. Pure C++17, little-endian explicit packing, no
// platform headers, so the (de)serialisers are host-unit-testable and identical
// on the phone and the peripheral.

#pragma once

#include <cstddef>
#include <cstdint>
#include <vector>

namespace gnc::android {

enum class MsgId : std::uint8_t {
    Sensor    = 0x01,
    Command   = 0x02,
    Heartbeat = 0x03,
};

enum class LinkMode : std::uint8_t { Idle = 0, Armed = 1, Flight = 2, Abort = 3 };

// L431 -> Android (inner-loop sensor snapshot).
struct SensorMsg {
    std::int64_t t_ns{0};
    float acc_b[3]{0, 0, 0};
    float gyro_b[3]{0, 0, 0};
    double lat{0}, lon{0}, alt{0};
    float vel_n[3]{0, 0, 0};
    std::uint8_t gps_valid{0};
    std::uint8_t imu_valid{0};

    std::vector<std::uint8_t> serialize() const;
    static bool deserialize(const std::uint8_t* p, std::size_t n, SensorMsg& out);
};

// Android -> L431 (outer-loop command).
struct CommandMsg {
    std::uint8_t n_fins{0};
    float fin_cmd_rad[4]{0, 0, 0, 0};
    float target_euler[3]{0, 0, 0};
    std::uint8_t mode{static_cast<std::uint8_t>(LinkMode::Idle)};

    std::vector<std::uint8_t> serialize() const;
    static bool deserialize(const std::uint8_t* p, std::size_t n, CommandMsg& out);
};

struct HeartbeatMsg {
    std::uint32_t seq{0};
    std::uint8_t state{0};

    std::vector<std::uint8_t> serialize() const;
    static bool deserialize(const std::uint8_t* p, std::size_t n, HeartbeatMsg& out);
};

}  // namespace gnc::android
