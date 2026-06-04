#include "gnc-core/control/BacksteppingController.h"
#include <cmath>
#include <algorithm>

namespace gnc::control {

BacksteppingController::BacksteppingController(const TuningParams& params) : params_(params) {}

void BacksteppingController::init() {}
void BacksteppingController::reset() {}

ControlEffort BacksteppingController::calculate_control(const ControllerState& current, const ControllerState& target, double dt) {
    ControlEffort effort;
    
    // Backstepping Controller.
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

    // Virtual control law for nested subsystems
    double c1 = 2.0; double c2 = 2.0;
    double z1_x = e_phi;   double alpha_x = -c1 * z1_x; double z2_x = -current.angular_velocity_rad_s.x - alpha_x;
    double z1_y = e_theta; double alpha_y = -c1 * z1_y; double z2_y = -current.angular_velocity_rad_s.y - alpha_y;
    double z1_z = e_psi;   double alpha_z = -c1 * z1_z; double z2_z = -current.angular_velocity_rad_s.z - alpha_z;
    effort.moments_body.x = -z1_x - c2 * z2_x;
    effort.moments_body.y = -z1_y - c2 * z2_y;
    effort.moments_body.z = -z1_z - c2 * z2_z;
    double kp=0; double kd=0;
    
    if (kp != 0 || kd != 0) {
        effort.moments_body.x = kp * e_phi   - kd * current.angular_velocity_rad_s.x;
        effort.moments_body.y = kp * e_theta - kd * current.angular_velocity_rad_s.y;
        effort.moments_body.z = kp * e_psi   - kd * current.angular_velocity_rad_s.z;
    }

    return effort;
}

} // namespace gnc::control
