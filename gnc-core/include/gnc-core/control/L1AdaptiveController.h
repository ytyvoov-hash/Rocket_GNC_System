#pragma once
#include "IController.h"

namespace gnc::control {

class L1AdaptiveController : public IController {
public:
    L1AdaptiveController(const TuningParams& params);

    void init() override;
    ControlEffort calculate_control(const ControllerState& current_state, const ControllerState& target_state, double dt) override;
    void reset() override;

private:
    TuningParams params_;
};

} // namespace gnc::control
