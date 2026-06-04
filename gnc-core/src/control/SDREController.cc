#include "gnc-core/control/SDREController.h"
#include <cmath>

namespace gnc::control {

SDREController::SDREController(const SDREGains& gains) : gains_(gains) {}

void SDREController::init() {}
void SDREController::reset() {}

ControlEffort SDREController::calculate_control(const ControllerState& current, const ControllerState& target, double dt) {
    ControlEffort effort;
    
    // SDRE (State-Dependent Riccati Equation) Placeholder
    
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

    double q_scaling = current.q_dyn > 10.0 ? (100.0 / current.q_dyn) : 1.0;
    double nonlinear_k = 10.0 * q_scaling * std::cos(current.euler_angles_rad.y);

    effort.moments_body.x = nonlinear_k * e_phi   - 2.0 * current.angular_velocity_rad_s.x;
    effort.moments_body.y = nonlinear_k * e_theta - 2.0 * current.angular_velocity_rad_s.y;
    effort.moments_body.z = nonlinear_k * e_psi   - 2.0 * current.angular_velocity_rad_s.z;

    return effort;
}

} // namespace gnc::control
