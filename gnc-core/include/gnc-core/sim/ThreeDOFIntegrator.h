// gnc-core/sim/ThreeDOFIntegrator.h
// Legacy PointMassSim logic adapted to the IntegratorBase interface.

#pragma once

#include "UnifiedSim.h"

namespace gnc::sim {

class ThreeDOFIntegrator : public IntegratorBase {
public:
    explicit ThreeDOFIntegrator(SimConfig cfg);

    SimFrame step() override;
    const SimFrame& current() const override { return frame_; }
    void reset() override;

private:
    SimConfig cfg_;
    SimFrame  frame_;
    Quat      current_q_b_n_;
    bool      ascending_{true};

    double mass_at(double t_s) const;
    double thrust_at(double t_s) const;
    Vec3   accel(double altitude, const Vec3& v_n, double mass, double thrust_n, double& out_drag_n) const;
};

}  // namespace gnc::sim
