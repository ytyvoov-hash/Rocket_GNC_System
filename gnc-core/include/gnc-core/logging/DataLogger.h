// gnc-core/logging/DataLogger.h
#pragma once

#include <string>
#include <vector>
#include <cstring>

#include <fstream>
#include "../types.h"

namespace gnc::logging {

// The canonical 103-column flight log format matching v5.4
struct LogRow {
    // Columns 1-32 (Kinematics)
    double time_s;
    double velocity_x_m_s, velocity_y_m_s, velocity_z_m_s, velocity_total_m_s;
    double position_x_m, position_y_m, position_z_m;
    double altitude_m, ground_range_m;
    double alpha_rad, alpha_deg, beta_rad, beta_deg;
    double mach, mach_aero, q_dynamic_Pa, q_gain_pilot_kPa, airspeed_m_s;
    double quat_w, quat_x, quat_y, quat_z;
    double roll_deg, pitch_deg, yaw_deg;
    double omega_x_rad_s, omega_y_rad_s, omega_z_rad_s;
    double omega_x_deg_s, omega_y_deg_s, omega_z_deg_s;

    // Columns 33-56 (Guidance and Autopilot)
    double guidance_mode; // Represented as enum/double in CSV
    double guidance_quat_cmd_w, guidance_quat_cmd_x, guidance_quat_cmd_y, guidance_quat_cmd_z;
    double autopilot_mode;
    double autopilot_control_stage;
    double moment_cmd_x_Nm, moment_cmd_y_Nm, moment_cmd_z_Nm;
    double attitude_error_x_rad, attitude_error_y_rad, attitude_error_z_rad;
    double rate_error_x_rad_s, rate_error_y_rad_s, rate_error_z_rad_s;
    double autopilot_quat_used_w, autopilot_quat_used_x, autopilot_quat_used_y, autopilot_quat_used_z;
    double autopilot_quat_cmd_used_w, autopilot_quat_cmd_used_x, autopilot_quat_cmd_used_y, autopilot_quat_cmd_used_z;

    // Columns 57-75 (Actuators, Forces, Phase)
    double fin1_deflection_rad, fin2_deflection_rad, fin3_deflection_rad, fin4_deflection_rad;
    double fin1_deflection_deg, fin2_deflection_deg, fin3_deflection_deg, fin4_deflection_deg;
    double force_x_N, force_y_N, force_z_N;
    double thrust_x_N, thrust_y_N, thrust_z_N;
    double moment_x_Nm, moment_y_Nm, moment_z_Nm;
    double mass_kg;
    double flight_phase;

    // Columns 76-88 (Aerodynamics)
    double CN_base, CM_base, CY_base, Cn_base;
    double CN_delta, CM_delta, CN_control, CM_control, CY_control, Cn_control;
    double M_roll_aero, M_pitch_aero, M_yaw_aero;

    // Columns 89-101 (CG, FUR, Accelerations)
    double xbc_m;
    double position_fur_x_m, position_fur_y_m, position_fur_z_m;
    double velocity_fur_x_m_s, velocity_fur_y_m_s, velocity_fur_z_m_s;
    double acceleration_fur_x_m_s2, acceleration_fur_y_m_s2, acceleration_fur_z_m_s2;
    double acceleration_body_x_g, acceleration_body_y_g, acceleration_body_z_g;

    // Columns 102-103 (Saturation Flags)
    uint16_t fin_rate_limited_flag;
    uint16_t fin_position_limited_flag;

    // ECEF and Altitude MSL additions
    double lat_deg;
    double lon_deg;
    double alt_msl_m;

    LogRow() {
        std::memset(this, 0, sizeof(*this));
    }
};

class DataLogger {
public:
    DataLogger(const std::string& filename);
    ~DataLogger();

    // High speed append
    void logRow(const LogRow& row);
    
    // Close and flush the log
    void close();

private:
    std::string filename_;
    std::ofstream out_;
    void writeHeader();
};

} // namespace gnc::logging
