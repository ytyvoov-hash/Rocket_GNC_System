// gnc-core/sim/TuningIntegrator.h

#pragma once

#include "UnifiedSim.h"

namespace gnc::sim {

class TuningIntegrator : public IntegratorBase {
public:
    explicit TuningIntegrator(SimConfig cfg);

    SimFrame step() override;
    const SimFrame& current() const override { return frame_; }
    void reset() override;
    void updateTuningParams(const TuningParams& params) override;

private:
    SimConfig cfg_;
    SimFrame  frame_;
    double    pid_integral_state_{0.0};
};

}  // namespace gnc::sim
