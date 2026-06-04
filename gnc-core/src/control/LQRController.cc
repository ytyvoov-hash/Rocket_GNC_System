#include "gnc-core/control/LQRController.h"

namespace gnc::control {

LQRController::LQRController(const LQRGains& gains) : gains_(gains) {}

void LQRController::init() {}
void LQRController::reset() {}

ControlEffort LQRController::calculate_control(const ControllerState& current, const ControllerState& target, double dt) {
    ControlEffort effort;
    if (gains_.K.empty()) return effort;

    // Standard LQR control law: u = -K * (x - x_ref)
    // We compute error x_ref - x = target - current, so u = K * error.
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

    double e_p = 0.0 - current.angular_velocity_rad_s.x;
    double e_q = 0.0 - current.angular_velocity_rad_s.y;
    double e_r = 0.0 - current.angular_velocity_rad_s.z;

    // The UI defines K vector. E.g., [K_angle, K_rate]
    if (gains_.K.size() >= 2) {
        double k_angle = gains_.K[0];
        double k_rate  = gains_.K[1];
        
        effort.moments_body.y = k_angle * e_theta + k_rate * e_q; // Pitch
        effort.moments_body.z = k_angle * e_psi   + k_rate * e_r; // Yaw
        effort.moments_body.x = k_angle * e_phi   + k_rate * e_p; // Roll
    }

    return effort;
}

} // namespace gnc::control
