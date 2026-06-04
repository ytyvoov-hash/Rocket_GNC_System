#include "gnc-core/control/SlidingModeController.h"
#include <cmath>
#include <algorithm>

namespace gnc::control {

SlidingModeController::SlidingModeController(const TuningParams& params) : params_(params) {}

void SlidingModeController::init() {}
void SlidingModeController::reset() {}

ControlEffort SlidingModeController::calculate_control(const ControllerState& current, const ControllerState& target, double dt) {
    ControlEffort effort;
    
    // Sliding Mode Controller.
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

    // Sliding surface s = e_dot + lambda * e
    double lambda = 5.0;
    double s_phi   = -current.angular_velocity_rad_s.x + lambda * e_phi;
    double s_theta = -current.angular_velocity_rad_s.y + lambda * e_theta;
    double s_psi   = -current.angular_velocity_rad_s.z + lambda * e_psi;
    auto sign = [](double v) { return v > 0 ? 1.0 : (v < 0 ? -1.0 : 0.0); };
    double k_smc = 15.0;
    effort.moments_body.x = k_smc * sign(s_phi);
    effort.moments_body.y = k_smc * sign(s_theta);
    effort.moments_body.z = k_smc * sign(s_psi);
    double kp = 0; double kd = 0;
    
    if (kp != 0 || kd != 0) {
        effort.moments_body.x = kp * e_phi   - kd * current.angular_velocity_rad_s.x;
        effort.moments_body.y = kp * e_theta - kd * current.angular_velocity_rad_s.y;
        effort.moments_body.z = kp * e_psi   - kd * current.angular_velocity_rad_s.z;
    }

    return effort;
}

} // namespace gnc::control
