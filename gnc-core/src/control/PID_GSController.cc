#include "gnc-core/control/PID_GSController.h"
#include <cmath>
#include <algorithm>

namespace gnc::control {

PID_GSController::PID_GSController(const TuningParams& params) : params_(params) {}

void PID_GSController::init() {}
void PID_GSController::reset() {}

ControlEffort PID_GSController::calculate_control(const ControllerState& current, const ControllerState& target, double dt) {
    ControlEffort effort;
    
    // Gain-scheduled PID controller.
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

    double q_scale = std::clamp(current.q_dyn / 10000.0, 0.1, 10.0);
    double kp = params_.kp * q_scale;
    double kd = params_.kd * q_scale;
    
    if (kp != 0 || kd != 0) {
        effort.moments_body.x = kp * e_phi   - kd * current.angular_velocity_rad_s.x;
        effort.moments_body.y = kp * e_theta - kd * current.angular_velocity_rad_s.y;
        effort.moments_body.z = kp * e_psi   - kd * current.angular_velocity_rad_s.z;
    }

    return effort;
}

} // namespace gnc::control
