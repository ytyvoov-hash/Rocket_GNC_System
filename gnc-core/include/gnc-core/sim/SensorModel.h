#pragma once
#include "gnc-core/types.h"
#include <random>

namespace gnc::sim {

struct SensorNoiseParams {
    // IMU Noise
    double accel_noise_density = 0.0; // m/s^2 / sqrt(Hz)
    double gyro_noise_density = 0.0;  // rad/s / sqrt(Hz)
    
    double accel_bias_instability = 0.0; // m/s^2
    double gyro_bias_instability = 0.0;  // rad/s
    
    // GPS Noise
    double gps_pos_std = 0.0; // m
    double gps_vel_std = 0.0; // m/s
};

struct SensorMeasurements {
    Vec3 accel_measured; // Body frame specific force (includes gravity and noise)
    Vec3 gyro_measured;  // Body frame angular rate
    Vec3 gps_pos_ned;    // NED position
    Vec3 gps_vel_ned;    // NED velocity
};

class SensorModel {
public:
    SensorModel(const SensorNoiseParams& params = {});

    // Compute noisy measurements from true states
    // dt_s is the sampling period (used to compute random walk standard deviations from noise densities)
    SensorMeasurements compute_measurements(
        const Vec3& r_ned_true,
        const Vec3& v_ned_true,
        const Quat& q_b_n_true,
        const Vec3& omega_b_b_true,
        const Vec3& accel_true_b,
        double dt_s
    );

private:
    SensorNoiseParams params_;

    // Random number generation
    std::mt19937 rng_;
    std::normal_distribution<double> normal_dist_{0.0, 1.0};

    // Tracking bias walk over time
    Vec3 accel_bias_{0,0,0};
    Vec3 gyro_bias_{0,0,0};
};

} // namespace gnc::sim
