// gnc-core/hal/IImu.h
// IMU sensor abstraction. The flight loop calls poll() at the configured rate;
// platforms decide whether to read SPI/I2C/USB/etc.

#pragma once

#include "../types.h"

namespace gnc::hal {

struct ImuSample {
    TimePoint t;
    Vec3 acc_b;        // m/s^2 in body frame
    Vec3 gyro_b;       // rad/s in body frame
    double temp_c{0};  // sensor die temperature
    bool valid{false};
};

class IImu {
public:
    virtual ~IImu() = default;

    // Returns the most recent sample. If no fresh sample is available since
    // the last poll, `valid` may be false.
    virtual ImuSample poll() = 0;

    // Nominal sample rate the sensor emits at. Used to size queues.
    virtual double nominal_rate_hz() const = 0;
};

}  // namespace gnc::hal
