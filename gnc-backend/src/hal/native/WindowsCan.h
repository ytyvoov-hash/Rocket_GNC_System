// gnc-backend/src/hal/native/WindowsCan.h
// Windows-specific CAN implementation for USB-CAN bridges.

#pragma once

#include "gnc-core/hal/ICan.h"

#include <memory>
#include <vector>

namespace gnc::backend::hal::native {

class WindowsCan : public gnc::hal::ICan {
public:
    WindowsCan();
    ~WindowsCan() override;

    bool send(const gnc::hal::CanFrame& f) override;
    bool recv(gnc::hal::CanFrame& out) override;
    double utilisation_pct() const override;

    // Open connection to USB-CAN bridge
    bool open(const std::string& port_name, int bitrate_bps);
    void close();

private:
    std::vector<gnc::hal::CanFrame> tx_log_;
    std::vector<gnc::hal::CanFrame> rx_queue_;
    double utilisation_{0.0};
    bool connected_{false};
};

}  // namespace gnc::backend::hal::native
