#pragma once

#include "IControlAllocator.h"

namespace gnc::control {

class FinAllocator : public IControlAllocator {
public:
    ActuatorCommands allocate(const ControlEffort& effort, const AllocatorState& state) override;
};

class TVCAllocator : public IControlAllocator {
public:
    ActuatorCommands allocate(const ControlEffort& effort, const AllocatorState& state) override;
};

} // namespace gnc::control
