// gnc-android/UsbCdcLink.h
//
// v8 P5.2. HDLC-like framing + CRC-16/CCITT-FALSE over a byte transport for the
// Android <-> STM32L431 USB-CDC link (docs/path_a_link_icd.md). Transport is
// abstracted (ITransport) so the framer is unit-testable on the host with an
// in-memory loopback; on the phone the transport is backed by the Android USB
// host API via JNI.

#pragma once

#include "gnc-android/Messages.h"

#include <cstddef>
#include <cstdint>
#include <vector>

namespace gnc::android {

// CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflect, xorout 0x0000).
std::uint16_t crc16_ccitt(const std::uint8_t* data, std::size_t len);

// Build a complete delimited+stuffed frame for (msg_id, payload).
std::vector<std::uint8_t> frame_encode(MsgId id, const std::uint8_t* payload, std::size_t n);

struct DecodedFrame {
    MsgId id{};
    std::vector<std::uint8_t> payload;
};

// Byte transport abstraction (USB-CDC on-device; loopback in tests).
class ITransport {
public:
    virtual ~ITransport() = default;
    virtual std::size_t write(const std::uint8_t* data, std::size_t n) = 0;
    virtual std::size_t read(std::uint8_t* out, std::size_t cap) = 0;
};

class UsbCdcLink {
public:
    explicit UsbCdcLink(ITransport& transport) : tx_(transport) {}

    // Encode + write a framed message.
    bool send(MsgId id, const std::vector<std::uint8_t>& payload);
    bool send_sensor(const SensorMsg& m)   { return send(MsgId::Sensor, m.serialize()); }
    bool send_command(const CommandMsg& m) { return send(MsgId::Command, m.serialize()); }
    bool send_heartbeat(const HeartbeatMsg& m) { return send(MsgId::Heartbeat, m.serialize()); }

    // Pull available bytes from the transport and return every complete,
    // CRC-valid frame decoded since the last call. CRC failures are dropped.
    std::vector<DecodedFrame> poll();

    // Stats for link health.
    std::uint32_t crc_errors() const { return crc_errors_; }

private:
    void feed(std::uint8_t byte, std::vector<DecodedFrame>& out);

    ITransport& tx_;
    std::vector<std::uint8_t> acc_;   // current frame accumulator (unstuffed)
    bool in_frame_{false};
    bool escape_{false};
    std::uint32_t crc_errors_{0};
};

}  // namespace gnc::android
