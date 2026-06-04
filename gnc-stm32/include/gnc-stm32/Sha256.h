// gnc-stm32/Sha256.h
//
// v8 P5.1. Minimal, dependency-free SHA-256 (FIPS 180-4) used by the firmware
// signing hook. Self-contained so it builds identically on the host and on the
// STM32H7 (no OpenSSL on-target). Matches Python `hashlib.sha256`, so the
// signing script (scripts/sign_firmware.py) and the on-target verify agree.

#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string>

namespace gnc::stm32 {

class Sha256 {
public:
    Sha256() { reset(); }
    void reset();
    void update(const std::uint8_t* data, std::size_t len);
    // Finalises and returns the 32-byte digest. The object must be reset()
    // before reuse.
    std::array<std::uint8_t, 32> digest();

    // One-shot helpers.
    static std::array<std::uint8_t, 32> hash(const std::uint8_t* data, std::size_t len);
    static std::string hex(const std::array<std::uint8_t, 32>& d);
    static std::string hash_hex(const std::uint8_t* data, std::size_t len) {
        return hex(hash(data, len));
    }

private:
    void process(const std::uint8_t* block);

    std::uint32_t h_[8];
    std::uint64_t bitlen_{0};
    std::uint8_t buf_[64];
    std::size_t buflen_{0};
};

}  // namespace gnc::stm32
