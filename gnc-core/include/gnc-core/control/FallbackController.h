#pragma once

#include "IController.h"
#include <string>

namespace gnc::control {

class FallbackController : public IController {
public:
    FallbackController(const std::string& name) : name_(name) {}

    void init() override {}
    
    ControlEffort calculate_control(const ControllerState& current_state, const ControllerState& target_state, double dt) override {
        // Fallback stub: Outputs zero effort.
        return ControlEffort();
    }
    
    void reset() override {}

private:
    std::string name_;
};

} // namespace gnc::control
