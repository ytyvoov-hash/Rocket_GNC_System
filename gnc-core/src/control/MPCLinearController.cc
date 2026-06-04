#include "gnc-core/control/MPCLinearController.h"
#include <cmath>
#include <algorithm>

namespace gnc::control {

MPCLinearController::MPCLinearController(const TuningParams& params) : params_(params) {}

void MPCLinearController::init() {}
void MPCLinearController::reset() {}

ControlEffort MPCLinearController::calculate_control(const ControllerState& current, const ControllerState& target, double dt) {
    ControlEffort effort;
    
    // Linear Model Predictive Control.
    // This is a math stub implementation.
    
    double e_phi   = target.euler_angles_rad.x - current.euler_angles_rad.x;
    double e_theta = target.euler_angles_rad.y - current.euler_angles_rad.y;
    double e_psi   = target.euler_angles_rad.z - current.euler_angles_rad.z;
    
    const double PI = 3.14159265358979323846;
    auto wrap_pi = [PI](double angle) {
        while (angle > PI) angle -= 2.0 * PI;
        while (angle < -PI) angle += 2.0 * PI;
        return angle;
    };
    e_phi   = wrap_pi(e_phi);
    e_theta = wrap_pi(e_theta);
    e_psi   = wrap_pi(e_psi);

    // Solves finite horizon QP (stubbed out)
    double horizon = 10;
    double kp = 8.0 + horizon*0.01;
    double kd = 2.0;
    
    if (kp != 0 || kd != 0) {
        effort.moments_body.x = kp * e_phi   - kd * current.angular_velocity_rad_s.x;
        effort.moments_body.y = kp * e_theta - kd * current.angular_velocity_rad_s.y;
        effort.moments_body.z = kp * e_psi   - kd * current.angular_velocity_rad_s.z;
    }

    return effort;
}

} // namespace gnc::control
