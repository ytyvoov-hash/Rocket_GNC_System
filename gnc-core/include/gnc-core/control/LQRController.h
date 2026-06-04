#pragma once

#include "IController.h"
#include <vector>

namespace gnc::control {

struct LQRGains {
    std::vector<double> Q;
    std::vector<double> R;
    std::vector<double> K; // pre-computed gain vector from UI
};

class LQRController : public IController {
public:
    LQRController(const LQRGains& gains);

    void init() override;
    ControlEffort calculate_control(const ControllerState& current_state, const ControllerState& target_state, double dt) override;
    void reset() override;

private:
    LQRGains gains_;
};

} // namespace gnc::control
