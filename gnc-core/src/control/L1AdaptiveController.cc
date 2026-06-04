#include "gnc-core/control/L1AdaptiveController.h"
#include <cmath>
#include <algorithm>

namespace gnc::control {

L1AdaptiveController::L1AdaptiveController(const TuningParams& params) : params_(params) {}

void L1AdaptiveController::init() {}
void L1AdaptiveController::reset() {}

ControlEffort L1AdaptiveController::calculate_control(const ControllerState& current, const ControllerState& target, double dt) {
    ControlEffort effort;
    
    // L1 Adaptive Control.
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

    // Fast adaptation + low pass filter stub
    double state_predictor_err = e_theta * 0.05;
    double adaptive_gain = 100.0 * state_predictor_err;
    double filter_bw = 10.0;
    double kp = 10.0 + adaptive_gain / filter_bw;
    double kd = 2.0;
    
    if (kp != 0 || kd != 0) {
        effort.moments_body.x = kp * e_phi   - kd * current.angular_velocity_rad_s.x;
        effort.moments_body.y = kp * e_theta - kd * current.angular_velocity_rad_s.y;
        effort.moments_body.z = kp * e_psi   - kd * current.angular_velocity_rad_s.z;
    }

    return effort;
}

} // namespace gnc::control
