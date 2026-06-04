// gnc-core/src/logging/DataLogger.cc

#include "gnc-core/logging/DataLogger.h"
#include <iomanip>
#include <cstring>
#include <iostream>

namespace gnc::logging {

DataLogger::DataLogger(const std::string& filename) : filename_(filename) {
    out_.open(filename_, std::ios::out | std::ios::trunc);
    if (out_.is_open()) {
        writeHeader();
        // Use scientific notation for all numbers to match v5.4
        out_ << std::scientific << std::setprecision(6);
    } else {
        std::cerr << "Failed to open DataLogger file: " << filename_ << std::endl;
    }
}

DataLogger::~DataLogger() {
    close();
}

void DataLogger::close() {
    if (out_.is_open()) {
        out_.close();
    }
}

void DataLogger::writeHeader() {
    // Exact 103 columns as requested
    out_ << "time_s,velocity_x_m_s,velocity_y_m_s,velocity_z_m_s,velocity_total_m_s,"
         << "position_x_m,position_y_m,position_z_m,altitude_m,ground_range_m,"
         << "alpha_rad,alpha_deg,beta_rad,beta_deg,mach,mach_aero,q_dynamic_Pa,q_gain_pilot_kPa,airspeed_m_s,"
         << "quat_w,quat_x,quat_y,quat_z,roll_deg,pitch_deg,yaw_deg,"
         << "omega_x_rad_s,omega_y_rad_s,omega_z_rad_s,omega_x_deg_s,omega_y_deg_s,omega_z_deg_s,"
         << "guidance_mode,guidance_quat_cmd_w,guidance_quat_cmd_x,guidance_quat_cmd_y,guidance_quat_cmd_z,"
         << "autopilot_mode,autopilot_control_stage,moment_cmd_x_Nm,moment_cmd_y_Nm,moment_cmd_z_Nm,"
         << "attitude_error_x_rad,attitude_error_y_rad,attitude_error_z_rad,"
         << "rate_error_x_rad_s,rate_error_y_rad_s,rate_error_z_rad_s,"
         << "autopilot_quat_used_w,autopilot_quat_used_x,autopilot_quat_used_y,autopilot_quat_used_z,"
         << "autopilot_quat_cmd_used_w,autopilot_quat_cmd_used_x,autopilot_quat_cmd_used_y,autopilot_quat_cmd_used_z,"
         << "fin1_deflection_rad,fin2_deflection_rad,fin3_deflection_rad,fin4_deflection_rad,"
         << "fin1_deflection_deg,fin2_deflection_deg,fin3_deflection_deg,fin4_deflection_deg,"
         << "force_x_N,force_y_N,force_z_N,thrust_x_N,thrust_y_N,thrust_z_N,"
         << "moment_x_Nm,moment_y_Nm,moment_z_Nm,mass_kg,flight_phase,"
         << "CN_base,CM_base,CY_base,Cn_base,CN_delta,CM_delta,CN_control,CM_control,CY_control,Cn_control,"
         << "M_roll_aero,M_pitch_aero,M_yaw_aero,xbc_m,"
         << "position_fur_x_m,position_fur_y_m,position_fur_z_m,velocity_fur_x_m_s,velocity_fur_y_m_s,velocity_fur_z_m_s,"
         << "acceleration_fur_x_m_s2,acceleration_fur_y_m_s2,acceleration_fur_z_m_s2,"
         << "acceleration_body_x_g,acceleration_body_y_g,acceleration_body_z_g,"
         << "fin_rate_limited_flag,fin_position_limited_flag,lat_deg,lon_deg,alt_msl_m\r\n";
}

void DataLogger::logRow(const LogRow& r) {
    if (!out_.is_open()) return;

    out_ << r.time_s << ","
         << r.velocity_x_m_s << "," << r.velocity_y_m_s << "," << r.velocity_z_m_s << "," << r.velocity_total_m_s << ","
         << r.position_x_m << "," << r.position_y_m << "," << r.position_z_m << "," << r.altitude_m << "," << r.ground_range_m << ","
         << r.alpha_rad << "," << r.alpha_deg << "," << r.beta_rad << "," << r.beta_deg << ","
         << r.mach << "," << r.mach_aero << "," << r.q_dynamic_Pa << "," << r.q_gain_pilot_kPa << "," << r.airspeed_m_s << ","
         << r.quat_w << "," << r.quat_x << "," << r.quat_y << "," << r.quat_z << ","
         << r.roll_deg << "," << r.pitch_deg << "," << r.yaw_deg << ","
         << r.omega_x_rad_s << "," << r.omega_y_rad_s << "," << r.omega_z_rad_s << ","
         << r.omega_x_deg_s << "," << r.omega_y_deg_s << "," << r.omega_z_deg_s << ","
         << r.guidance_mode << "," << r.guidance_quat_cmd_w << "," << r.guidance_quat_cmd_x << "," << r.guidance_quat_cmd_y << "," << r.guidance_quat_cmd_z << ","
         << r.autopilot_mode << "," << r.autopilot_control_stage << ","
         << r.moment_cmd_x_Nm << "," << r.moment_cmd_y_Nm << "," << r.moment_cmd_z_Nm << ","
         << r.attitude_error_x_rad << "," << r.attitude_error_y_rad << "," << r.attitude_error_z_rad << ","
         << r.rate_error_x_rad_s << "," << r.rate_error_y_rad_s << "," << r.rate_error_z_rad_s << ","
         << r.autopilot_quat_used_w << "," << r.autopilot_quat_used_x << "," << r.autopilot_quat_used_y << "," << r.autopilot_quat_used_z << ","
         << r.autopilot_quat_cmd_used_w << "," << r.autopilot_quat_cmd_used_x << "," << r.autopilot_quat_cmd_used_y << "," << r.autopilot_quat_cmd_used_z << ","
         << r.fin1_deflection_rad << "," << r.fin2_deflection_rad << "," << r.fin3_deflection_rad << "," << r.fin4_deflection_rad << ","
         << r.fin1_deflection_deg << "," << r.fin2_deflection_deg << "," << r.fin3_deflection_deg << "," << r.fin4_deflection_deg << ","
         << r.force_x_N << "," << r.force_y_N << "," << r.force_z_N << ","
         << r.thrust_x_N << "," << r.thrust_y_N << "," << r.thrust_z_N << ","
         << r.moment_x_Nm << "," << r.moment_y_Nm << "," << r.moment_z_Nm << ","
         << r.mass_kg << "," << r.flight_phase << ","
         << r.CN_base << "," << r.CM_base << "," << r.CY_base << "," << r.Cn_base << ","
         << r.CN_delta << "," << r.CM_delta << "," << r.CN_control << "," << r.CM_control << "," << r.CY_control << "," << r.Cn_control << ","
         << r.M_roll_aero << "," << r.M_pitch_aero << "," << r.M_yaw_aero << "," << r.xbc_m << ","
         << r.position_fur_x_m << "," << r.position_fur_y_m << "," << r.position_fur_z_m << ","
         << r.velocity_fur_x_m_s << "," << r.velocity_fur_y_m_s << "," << r.velocity_fur_z_m_s << ","
         << r.acceleration_fur_x_m_s2 << "," << r.acceleration_fur_y_m_s2 << "," << r.acceleration_fur_z_m_s2 << ","
         << r.acceleration_body_x_g << "," << r.acceleration_body_y_g << "," << r.acceleration_body_z_g << ","
         << r.fin_rate_limited_flag << "," << r.fin_position_limited_flag << ","
         << r.lat_deg << "," << r.lon_deg << "," << r.alt_msl_m << "\r\n";
}

} // namespace gnc::logging
