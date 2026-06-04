// gnc-backend/src/hal/native/HalFactories.cc
// Registration of native Windows HAL implementations.

#include "HalFactories.h"
#include "WindowsThermal.h"
#include "WindowsCan.h"

#include "gnc-core/hal/HalFactory.h"

namespace gnc::backend::hal::native {

std::unique_ptr<gnc::hal::IThermal> make_windows_thermal()
{
    return std::make_unique<WindowsThermal>();
}

std::unique_ptr<gnc::hal::ICan> make_windows_can()
{
    return std::make_unique<WindowsCan>();
}

void register_native_factories()
{
    gnc::hal::register_thermal_factory(make_windows_thermal);
    gnc::hal::register_can_factory(make_windows_can);
    
    // Other HAL interfaces remain as stubs for now
    // (Clock, Imu, Gps, Pyro, Radio, Fins, Seeker)
}

}  // namespace gnc::backend::hal::native
