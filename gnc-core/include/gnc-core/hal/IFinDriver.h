// gnc-core/hal/IFinDriver.h
// Fin / servo driver abstraction. Receives commanded deflections from the
// control mixer and pushes them onto CAN (or rudder_7b UART per §7.3.10).

#pragma once

#include <cstdint>
#include <vector>

namespace gnc::hal {

struct FinCommand {
    std::uint8_t fin_index{0};      // 0..11
    double delta_deg{0};            // commanded deflection
    double rate_deg_s{0};           // optional feed-forward rate
};

struct FinFeedback {
    std::uint8_t fin_index{0};
    double delta_meas_deg{0};
    double current_A{0};
    double temp_c{0};
    bool ok{false};
};

class IFinDriver {
public:
    virtual ~IFinDriver() = default;

    // Push a batch of fin commands. Implementations send a single CANOpen
    // PDO per fin or a single rudder_7b frame.
    virtual bool send(const std::vector<FinCommand>& cmds) = 0;

    // Latest feedback from every fin known to the driver.
    virtual std::vector<FinFeedback> feedback() = 0;

    // Number of fins this driver is configured for (read from hardware_mapping).
    virtual std::uint8_t fin_count() const = 0;
};

}  // namespace gnc::hal
