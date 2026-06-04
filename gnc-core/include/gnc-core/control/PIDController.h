#pragma once

#include "IController.h"

namespace gnc::control {

class PIDController : public IController {
public:
    PIDController(const TuningParams& params);

    void init() override;
    ControlEffort calculate_control(const ControllerState& current_state, const ControllerState& target_state, double dt) override;
    void reset() override;

private:
    TuningParams params_;
    Vec3 integral_err_{0.0, 0.0, 0.0};
    Vec3 prev_err_{0.0, 0.0, 0.0};
};

} // namespace gnc::control
