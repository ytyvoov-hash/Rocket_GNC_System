#include "gnc-core/sim/SensorModel.h"
#include <cmath>

namespace gnc::sim {

SensorModel::SensorModel(const SensorNoiseParams& params) 
    : params_(params) 
{
    rng_.seed(12345); // Fixed seed for reproducible tests, could be randomized in Monte Carlo
}

SensorMeasurements SensorModel::compute_measurements(
    const Vec3& r_ned_true,
    const Vec3& v_ned_true,
    const Quat& /*q_b_n_true*/,
    const Vec3& omega_b_b_true,
    const Vec3& accel_true_b,
    double dt_s
) {
    SensorMeasurements meas;
    
    // 1. IMU Accelerometer
    // Calculate discrete noise standard deviations
    double accel_noise_std = 0.0;
    double gyro_noise_std = 0.0;
    
    if (dt_s > 0) {
        accel_noise_std = params_.accel_noise_density / std::sqrt(dt_s);
        gyro_noise_std = params_.gyro_noise_density / std::sqrt(dt_s);
    }
    
    // Accelerometer bias random walk integration
    // Simplified bias instability model
    accel_bias_.x += normal_dist_(rng_) * params_.accel_bias_instability * std::sqrt(dt_s);
    accel_bias_.y += normal_dist_(rng_) * params_.accel_bias_instability * std::sqrt(dt_s);
    accel_bias_.z += normal_dist_(rng_) * params_.accel_bias_instability * std::sqrt(dt_s);
    
    meas.accel_measured.x = accel_true_b.x + accel_bias_.x + normal_dist_(rng_) * accel_noise_std;
    meas.accel_measured.y = accel_true_b.y + accel_bias_.y + normal_dist_(rng_) * accel_noise_std;
    meas.accel_measured.z = accel_true_b.z + accel_bias_.z + normal_dist_(rng_) * accel_noise_std;

    // 2. IMU Gyroscope
    gyro_bias_.x += normal_dist_(rng_) * params_.gyro_bias_instability * std::sqrt(dt_s);
    gyro_bias_.y += normal_dist_(rng_) * params_.gyro_bias_instability * std::sqrt(dt_s);
    gyro_bias_.z += normal_dist_(rng_) * params_.gyro_bias_instability * std::sqrt(dt_s);

    meas.gyro_measured.x = omega_b_b_true.x + gyro_bias_.x + normal_dist_(rng_) * gyro_noise_std;
    meas.gyro_measured.y = omega_b_b_true.y + gyro_bias_.y + normal_dist_(rng_) * gyro_noise_std;
    meas.gyro_measured.z = omega_b_b_true.z + gyro_bias_.z + normal_dist_(rng_) * gyro_noise_std;

    // 3. GPS Position
    meas.gps_pos_ned.x = r_ned_true.x + normal_dist_(rng_) * params_.gps_pos_std;
    meas.gps_pos_ned.y = r_ned_true.y + normal_dist_(rng_) * params_.gps_pos_std;
    meas.gps_pos_ned.z = r_ned_true.z + normal_dist_(rng_) * params_.gps_pos_std;

    // 4. GPS Velocity
    meas.gps_vel_ned.x = v_ned_true.x + normal_dist_(rng_) * params_.gps_vel_std;
    meas.gps_vel_ned.y = v_ned_true.y + normal_dist_(rng_) * params_.gps_vel_std;
    meas.gps_vel_ned.z = v_ned_true.z + normal_dist_(rng_) * params_.gps_vel_std;

    return meas;
}

} // namespace gnc::sim
