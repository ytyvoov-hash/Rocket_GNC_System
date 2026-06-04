// gnc-backend/src/hal/native/WindowsCan.cc
// Windows CAN implementation - currently stubbed, would need
// vendor-specific SDKs (CH340, Candlelight, etc.) for actual USB-CAN bridge support.

#include "WindowsCan.h"

namespace gnc::backend::hal::native {

WindowsCan::WindowsCan()
{
}

WindowsCan::~WindowsCan()
{
    close();
}

bool WindowsCan::open(const std::string& port_name, int bitrate_bps)
{
    // TODO: Implement actual USB-CAN bridge connection
    // This would require vendor-specific SDKs:
    // - CH340: WCH CH341 driver
    // - Candlelight: libusb/gs_usb
    // - Kvaser/PEAK: vendor SDKs
    // For now, return false to indicate not implemented
    (void)port_name;
    (void)bitrate_bps;
    return false;
}

void WindowsCan::close()
{
    connected_ = false;
}

bool WindowsCan::send(const gnc::hal::CanFrame& f)
{
    tx_log_.push_back(f);
    return true;  // Always succeeds in stub mode
}

bool WindowsCan::recv(gnc::hal::CanFrame& out)
{
    if (rx_queue_.empty()) return false;
    out = rx_queue_.back();
    rx_queue_.pop_back();
    return true;
}

double WindowsCan::utilisation_pct() const
{
    return utilisation_;
}

}  // namespace gnc::backend::hal::native
