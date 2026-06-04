// gnc-core/hal/ICan.h
// CAN bus abstraction. Both classic CAN (Path A USB-CAN) and FDCAN (Path B
// integrated controller) live behind this interface.

#pragma once

#include "../types.h"
#include <array>
#include <cstdint>

namespace gnc::hal {

struct CanFrame {
    TimePoint t;
    std::uint32_t id{0};
    std::uint8_t dlc{0};
    bool fdcan{false};
    bool extended_id{false};
    std::array<std::uint8_t, 64> data{};   // 8 for classic, up to 64 for FDCAN
};

class ICan {
public:
    virtual ~ICan() = default;

    virtual bool send(const CanFrame& f) = 0;

    // Non-blocking pop from the receive queue. Returns false when empty.
    virtual bool recv(CanFrame& out) = 0;

    // Live bus-utilisation percentage. Clause C25 budget threshold is < 70.
    virtual double utilisation_pct() const = 0;
};

}  // namespace gnc::hal
