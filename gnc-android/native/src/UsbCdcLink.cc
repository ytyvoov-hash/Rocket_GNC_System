// gnc-android/UsbCdcLink.cc — framing + CRC-16/CCITT-FALSE (v8 P5.2).
#include "gnc-android/UsbCdcLink.h"

namespace gnc::android {
namespace {
constexpr std::uint8_t kFlag = 0x7E;
constexpr std::uint8_t kEsc  = 0x7D;
constexpr std::uint8_t kXor  = 0x20;

void stuff(std::vector<std::uint8_t>& out, std::uint8_t b) {
    if (b == kFlag || b == kEsc) {
        out.push_back(kEsc);
        out.push_back(b ^ kXor);
    } else {
        out.push_back(b);
    }
}
}  // namespace

std::uint16_t crc16_ccitt(const std::uint8_t* data, std::size_t len) {
    std::uint16_t crc = 0xFFFF;
    for (std::size_t i = 0; i < len; ++i) {
        crc ^= static_cast<std::uint16_t>(data[i]) << 8;
        for (int b = 0; b < 8; ++b) {
            if (crc & 0x8000) crc = static_cast<std::uint16_t>((crc << 1) ^ 0x1021);
            else              crc = static_cast<std::uint16_t>(crc << 1);
        }
    }
    return crc;
}

std::vector<std::uint8_t> frame_encode(MsgId id, const std::uint8_t* payload, std::size_t n) {
    // Body = MSG_ID || PAYLOAD, CRC computed over the body.
    std::vector<std::uint8_t> body;
    body.reserve(n + 1);
    body.push_back(static_cast<std::uint8_t>(id));
    body.insert(body.end(), payload, payload + n);
    const std::uint16_t crc = crc16_ccitt(body.data(), body.size());

    std::vector<std::uint8_t> out;
    out.reserve(body.size() + 6);
    out.push_back(kFlag);
    for (std::uint8_t b : body) stuff(out, b);
    stuff(out, static_cast<std::uint8_t>(crc >> 8));    // CRC big-endian
    stuff(out, static_cast<std::uint8_t>(crc & 0xFF));
    out.push_back(kFlag);
    return out;
}

bool UsbCdcLink::send(MsgId id, const std::vector<std::uint8_t>& payload) {
    const auto frame = frame_encode(id, payload.data(), payload.size());
    return tx_.write(frame.data(), frame.size()) == frame.size();
}

void UsbCdcLink::feed(std::uint8_t byte, std::vector<DecodedFrame>& out) {
    if (byte == kFlag) {
        // Closing (or opening) delimiter. A non-empty accumulator means a frame
        // just completed.
        if (in_frame_ && !acc_.empty() && !escape_) {
            // acc_ = MSG_ID || PAYLOAD || CRC_hi || CRC_lo
            if (acc_.size() >= 3) {
                const std::size_t body_len = acc_.size() - 2;
                const std::uint16_t rx_crc =
                    static_cast<std::uint16_t>(acc_[body_len] << 8 | acc_[body_len + 1]);
                if (crc16_ccitt(acc_.data(), body_len) == rx_crc) {
                    DecodedFrame f;
                    f.id = static_cast<MsgId>(acc_[0]);
                    f.payload.assign(acc_.begin() + 1, acc_.begin() + body_len);
                    out.push_back(std::move(f));
                } else {
                    ++crc_errors_;
                }
            } else {
                ++crc_errors_;
            }
        }
        acc_.clear();
        escape_ = false;
        in_frame_ = true;
        return;
    }

    if (!in_frame_) return;  // bytes before the first flag are noise

    if (escape_) {
        acc_.push_back(byte ^ kXor);
        escape_ = false;
    } else if (byte == kEsc) {
        escape_ = true;
    } else {
        acc_.push_back(byte);
    }
}

std::vector<DecodedFrame> UsbCdcLink::poll() {
    std::vector<DecodedFrame> out;
    std::uint8_t buf[256];
    std::size_t n;
    while ((n = tx_.read(buf, sizeof(buf))) > 0) {
        for (std::size_t i = 0; i < n; ++i) feed(buf[i], out);
        if (n < sizeof(buf)) break;  // drained
    }
    return out;
}

}  // namespace gnc::android
