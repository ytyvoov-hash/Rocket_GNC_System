// gnc-backend/src/hal/native/HalFactories.h
// Factory functions for native Windows HAL implementations.
// These are registered with gnc-core's HalFactory at backend startup.

#pragma once

#include "gnc-core/hal/HalFactory.h"

namespace gnc::backend::hal::native {

// Register all native Windows HAL implementations with the HalFactory.
// Call this during backend startup before HalFactory::build_default().
void register_native_factories();

}  // namespace gnc::backend::hal::native
