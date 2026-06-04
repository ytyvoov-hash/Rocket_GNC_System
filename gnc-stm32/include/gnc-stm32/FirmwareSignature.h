// gnc-stm32/FirmwareSignature.h
//
// v8 P5.1 + INV-6. Firmware signing/verification hook. The release pipeline
// runs scripts/sign_firmware.py to compute the SHA-256 of the linked image and
// record it in release_manifest.yaml (path_b.firmware_sha256). At boot the
// target recomputes the digest over its own image region and compares it
// against the expected hash embedded at build time. A flight build refuses to
// leave SelfTest if the image is unsigned or the digest does not match.
//
// This module is the portable core (digest + compare). The platform wrapper
// supplies the actual image base/length (linker symbols on-target; a buffer on
// the host bench).

#pragma once

#include "gnc-stm32/Sha256.h"

#include <cstddef>
#include <cstdint>
#include <string>

namespace gnc::stm32 {

struct FirmwareImage {
    const std::uint8_t* base{nullptr};
    std::size_t length{0};
};

class FirmwareSignature {
public:
    // expected_sha256_hex is the hash recorded by the signing pipeline. Empty
    // string means "unsigned" (rejected by a flight build).
    explicit FirmwareSignature(std::string expected_sha256_hex)
        : expected_(std::move(expected_sha256_hex)) {}

    bool is_signed() const { return expected_.size() == 64; }

    // Recompute over the given image and compare to the expected hash.
    bool verify(const FirmwareImage& img) const {
        if (!is_signed() || img.base == nullptr || img.length == 0) return false;
        return Sha256::hash_hex(img.base, img.length) == expected_;
    }

    const std::string& expected() const { return expected_; }

private:
    std::string expected_;
};

}  // namespace gnc::stm32
