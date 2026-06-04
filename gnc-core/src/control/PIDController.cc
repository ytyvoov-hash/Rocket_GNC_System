#include "gnc-core/control/PIDController.h"
#include <cmath>

namespace gnc::control {

PIDController::PIDController(const TuningParams& params) : params_(params) {}

void PIDController::init() {
    reset();
}

void PIDController::reset() {
    integral_err_ = {0.0, 0.0, 0.0};
    prev_err_     = {0.0, 0.0, 0.0};
}

ControlEffort PIDController::calculate_control(const ControllerState& current, const ControllerState& target, double dt) {
    ControlEffort effort;
    if (dt <= 0.0) return effort;
    
    double e_roll  = target.euler_angles_rad.x - current.euler_angles_rad.x;
    double e_pitch = target.euler_angles_rad.y - current.euler_angles_rad.y;
    double e_yaw   = target.euler_angles_rad.z - current.euler_angles_rad.z;

    // Wrap-around protection
    const double PI = 3.14159265358979323846;
    auto wrap_pi = [PI](double angle) {
        while (angle > PI) angle -= 2.0 * PI;
        while (angle < -PI) angle += 2.0 * PI;
        return angle;
    };
    e_roll = wrap_pi(e_roll);
    e_pitch = wrap_pi(e_pitch);
    e_yaw = wrap_pi(e_yaw);

    // Outer loop: attitude error -> target rate
    double target_p = e_roll  * 2.0; 
    double target_q = e_pitch * 2.0;
    double target_r = e_yaw   * 2.0;

    // Inner loop: rate error -> torque command
    double err_p = target_p - current.angular_velocity_rad_s.x;
    double err_q = target_q - current.angular_velocity_rad_s.y;
    double err_r = target_r - current.angular_velocity_rad_s.z;

    integral_err_.x += err_p * dt;
    integral_err_.y += err_q * dt;
    integral_err_.z += err_r * dt;

    // Anti-windup
    auto clamp = [](double& val, double max_val) {
        if (val > max_val) val = max_val;
        if (val < -max_val) val = -max_val;
    };
    clamp(integral_err_.x, 10.0);
    clamp(integral_err_.y, 10.0);
    clamp(integral_err_.z, 10.0);

    double d_p = (err_p - prev_err_.x) / dt;
    double d_q = (err_q - prev_err_.y) / dt;
    double d_r = (err_r - prev_err_.z) / dt;

    prev_err_ = {err_p, err_q, err_r};

    double kp = params_.kp;
    double ki = params_.ki;
    double kd = params_.kd;

    effort.moments_body.x = kp * err_p + ki * integral_err_.x + kd * d_p;
    effort.moments_body.y = kp * err_q + ki * integral_err_.y + kd * d_q;
    effort.moments_body.z = kp * err_r + ki * integral_err_.z + kd * d_r;

    return effort;
}

} // namespace gnc::control
