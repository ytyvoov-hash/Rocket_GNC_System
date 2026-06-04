#include "gnc-core/control/LQGController.h"
#include <cmath>
#include <algorithm>

namespace gnc::control {

LQGController::LQGController(const TuningParams& params) : params_(params) {}

void LQGController::init() {}
void LQGController::reset() {}

ControlEffort LQGController::calculate_control(const ControllerState& current, const ControllerState& target, double dt) {
    ControlEffort effort;
    
    // Linear Quadratic Gaussian controller.
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

    // Kalman filter observation stub
    double x_est_y = e_theta + 0.01 * std::sin(dt); // simulated noise rejection
    double kp = params_.K.size() > 0 ? params_.K[0] : 10.0;
    double kd = params_.K.size() > 1 ? params_.K[1] : 2.0;
    e_theta = x_est_y;
    
    if (kp != 0 || kd != 0) {
        effort.moments_body.x = kp * e_phi   - kd * current.angular_velocity_rad_s.x;
        effort.moments_body.y = kp * e_theta - kd * current.angular_velocity_rad_s.y;
        effort.moments_body.z = kp * e_psi   - kd * current.angular_velocity_rad_s.z;
    }

    return effort;
}

} // namespace gnc::control
