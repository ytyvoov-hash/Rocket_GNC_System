// gnc-core/hal/IRadio.h
// Telemetry radio abstraction. Emits MisPlot 77-byte frames to the GCS.

#pragma once

#include <cstdint>

namespace gnc::hal {

class IRadio {
public:
    virtual ~IRadio() = default;

    // Transmit one MisPlot frame. Returns false if the link is down or busy.
    virtual bool send(const std::uint8_t* data, std::size_t len) = 0;

    // Link health (0..1).
    virtual double link_quality() const = 0;

    // Configurable centre frequency in kHz (operator-editable per mission).
    virtual std::uint32_t frequency_khz() const = 0;
    virtual void set_frequency_khz(std::uint32_t freq) = 0;
};

}  // namespace gnc::hal
