#pragma once
#include "IController.h"
#include "IControlAllocator.h"
#include <memory>
#include <tuple>

namespace gnc::control {

class ControllerFactory {
public:
    static std::tuple<std::shared_ptr<IController>, std::shared_ptr<IControlAllocator>> create(const TuningParams& params);
};

}
