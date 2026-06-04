#pragma once

#include "IController.h"
#include <vector>

namespace gnc::control {

struct SDREGains {
    std::vector<double> Q;
    std::vector<double> R;
};

class SDREController : public IController {
public:
    SDREController(const SDREGains& gains);

    void init() override;
    ControlEffort calculate_control(const ControllerState& current_state, const ControllerState& target_state, double dt) override;
    void reset() override;

private:
    SDREGains gains_;
};

} // namespace gnc::control
