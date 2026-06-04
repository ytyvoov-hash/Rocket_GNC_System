// gnc-backend/src/hal/native/WindowsThermal.h
// Windows-specific thermal monitoring (CPU temp, load, heap stats).

#pragma once

#include "gnc-core/hal/IThermal.h"

namespace gnc::backend::hal::native {

class WindowsThermal : public gnc::hal::IThermal {
public:
    WindowsThermal();
    ~WindowsThermal() override = default;

    gnc::hal::ThermalSample sample() override;
};

}  // namespace gnc::backend::hal::native
