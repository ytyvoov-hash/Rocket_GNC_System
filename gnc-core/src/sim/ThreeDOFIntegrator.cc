// gnc-core/src/sim/ThreeDOFIntegrator.cc

#include "gnc-core/sim/ThreeDOFIntegrator.h"
#include <cmath>
#include <algorithm>

namespace gnc::sim {

namespace {

constexpr double kEps = 1e-12;
// PI, DEG2RAD, RAD2DEG are in gnc::types.h

double vec_norm(const Vec3& v)
{
    return std::sqrt(v.norm_sq());
}

Vec3 add(const Vec3& a, const Vec3& b)        { return {a.x+b.x, a.y+b.y, a.z+b.z}; }
Vec3 scale(const Vec3& a, double s)           { return {a.x*s,   a.y*s,   a.z*s  }; }
Vec3 sub(const Vec3& a, const Vec3& b)        { return {a.x-b.x, a.y-b.y, a.z-b.z}; }

Quat normalize(Quat q) {
    double n = std::sqrt(q.w*q.w + q.x*q.x + q.y*q.y + q.z*q.z);
    if (n < 1e-12) return {1.0, 0.0, 0.0, 0.0};
    return {q.w/n, q.x/n, q.y/n, q.z/n};
}

Quat mult(Quat p, Quat q) {
    return {
        p.w*q.w - p.x*q.x - p.y*q.y - p.z*q.z,
        p.w*q.x + p.x*q.w + p.y*q.z - p.z*q.y,
        p.w*q.y - p.x*q.z + p.y*q.w + p.z*q.x,
        p.w*q.z + p.x*q.y - p.y*q.x + p.z*q.w
    };
}

Vec3 rotate(Quat q, Vec3 v) {
    Quat qv{0, v.x, v.y, v.z};
    Quat q_inv{q.w, -q.x, -q.y, -q.z};
    Quat r = mult(mult(q, qv), q_inv);
    return {r.x, r.y, r.z};
}

void euler_from_quat(const Quat& q, double& roll, double& pitch, double& yaw) {
    pitch = std::asin(std::clamp(2.0 * (q.w*q.y - q.z*q.x), -1.0, 1.0));
    yaw = std::atan2(2.0 * (q.w*q.z + q.x*q.y), 1.0 - 2.0 * (q.y*q.y + q.z*q.z));
    roll = std::atan2(2.0 * (q.w*q.x + q.y*q.z), 1.0 - 2.0 * (q.x*q.x + q.y*q.y));
}

Quat quat_from_euler(double yaw, double pitch, double roll) {
    double cy = std::cos(yaw * 0.5);
    double sy = std::sin(yaw * 0.5);
    double cp = std::cos(pitch * 0.5);
    double sp = std::sin(pitch * 0.5);
    double cr = std::cos(roll * 0.5);
    double sr = std::sin(roll * 0.5);

    return {
        cr * cp * cy + sr * sp * sy,
        sr * cp * cy - cr * sp * sy,
        cr * sp * cy + sr * cp * sy,
        cr * cp * sy - sr * sp * cy
    };
}

}  // namespace

ThreeDOFIntegrator::ThreeDOFIntegrator(SimConfig cfg)
    : cfg_(std::move(cfg))
{
    reset();
}

void ThreeDOFIntegrator::reset()
{
    frame_ = SimFrame{};
    frame_.t_s            = 0.0;
    frame_.r_n            = cfg_.r0_n;
    frame_.v_n            = cfg_.v0_n;
    current_q_b_n_        = cfg_.q0_b_n;
    
    // Evaluate initial mass and thrust
    if (cfg_.thrust_curve && cfg_.thrust_curve->isLoaded()) {
        frame_.thrust_n = cfg_.thrust_curve->lookup(0.0).thrust_N;
    } else {
        frame_.thrust_n = thrust_at(0.0);
    }
    
    frame_.mass_kg        = cfg_.mass_init_kg;
    frame_.altitude_msl_m = -frame_.r_n.z;
    frame_.speed_m_s      = vec_norm(frame_.v_n);
    frame_.phase          = (frame_.thrust_n > kEps) ? FlightPhase::BoostS1
                                                     : FlightPhase::Prelaunch;
    frame_.finished       = false;
    ascending_            = (cfg_.v0_n.z <= 0.0);   
}

double ThreeDOFIntegrator::mass_at(double t_s) const
{
    if (cfg_.burn_time_s <= kEps) return cfg_.mass_init_kg;
    if (t_s >= cfg_.burn_time_s)  return cfg_.mass_dry_kg;
    
    // Use exact mass flow from thrust curve CSV if available
    // Prefer motor_on_curve for mass flow during burn
    std::shared_ptr<ThrustCurve> mass_curve = cfg_.motor_on_curve && cfg_.motor_on_curve->isLoaded() 
        ? cfg_.motor_on_curve 
        : cfg_.thrust_curve;
    
    if (mass_curve && mass_curve->isLoaded()) {
        double mass_lost = mass_curve->computeCumulativeMassLoss(t_s);
        return cfg_.mass_init_kg - mass_lost;
    }
    
    // Fallback to linear interpolation
    const double frac = t_s / cfg_.burn_time_s;
    return cfg_.mass_init_kg + frac * (cfg_.mass_dry_kg - cfg_.mass_init_kg);
}

double ThreeDOFIntegrator::thrust_at(double t_s) const
{
    // Use motor-on/motor-off thrust curves if available
    if (cfg_.motor_on_curve && cfg_.motor_on_curve->isLoaded() && cfg_.motor_off_curve && cfg_.motor_off_curve->isLoaded()) {
        auto motor_on_data = cfg_.motor_on_curve->lookup(t_s);
        if (motor_on_data.thrust_N > 1e-6) {
            return motor_on_data.thrust_N;
        } else {
            return cfg_.motor_off_curve->lookup(t_s).thrust_N;
        }
    } else if (cfg_.thrust_curve && cfg_.thrust_curve->isLoaded()) {
        return cfg_.thrust_curve->lookup(t_s).thrust_N;
    }
    
    // Fallback to constant thrust
    if (t_s < cfg_.burn_time_s - kEps) return cfg_.thrust_N;
    return 0.0;
}

Vec3 ThreeDOFIntegrator::accel(double altitude, const Vec3& v_n, double mass, double thrust_N,
                         double& out_drag_N) const
{
    out_drag_N = 0.0;
    
    // Atmospheric conditions
    double rho = cfg_.rho_kg_m3;
    double sos = 340.29; // Speed of sound approx
    Vec3 wind_n{0.0, 0.0, 0.0};
    if (cfg_.atmosphere_table && cfg_.atmosphere_table->isLoaded()) {
        auto atmo = cfg_.atmosphere_table->lookup(altitude);
        rho = atmo.density_kg_m3;
        sos = atmo.speed_of_sound_m_s;
        wind_n = {atmo.wind_north_m_s, atmo.wind_east_m_s, atmo.wind_down_m_s};
    }

    // Use airspeed velocity (ground velocity minus wind) for drag calculation in 3DOF
    Vec3 v_air = sub(v_n, wind_n);
    double speed = vec_norm(v_air);
    double mach = (sos > 1.0) ? (speed / sos) : 0.0;
    double q_bar = 0.5 * rho * speed * speed;

    // Inverse quat for alpha/beta computation using airspeed
    Quat q_inv = {current_q_b_n_.w, -current_q_b_n_.x, -current_q_b_n_.y, -current_q_b_n_.z};
    Vec3 v_b = rotate(q_inv, v_air);
    
    double alpha_rad = 0.0;
    double beta_rad = 0.0;
    if (v_b.x > kEps) {
        alpha_rad = std::atan2(v_b.z, v_b.x);
        beta_rad = std::atan2(v_b.y, std::sqrt(v_b.x*v_b.x + v_b.z*v_b.z));
    }
    double alpha_deg = alpha_rad * gnc::RAD2DEG;

    // Choose between motor_on and motor_off CA tables
    double CA = cfg_.cd_A_m2 / 0.0314; // Fallback CA approx
    std::shared_ptr<AeroCoeffs> active_aero = cfg_.aero_coeffs;
    if (thrust_N > 1e-6) {
        if (cfg_.aero_coeffs_motor_on && cfg_.aero_coeffs_motor_on->isLoaded()) {
            active_aero = cfg_.aero_coeffs_motor_on;
        }
    } else {
        if (cfg_.aero_coeffs_motor_off && cfg_.aero_coeffs_motor_off->isLoaded()) {
            active_aero = cfg_.aero_coeffs_motor_off;
        }
    }

    if (active_aero && active_aero->isLoaded()) {
        CA = active_aero->lookup(mach, alpha_deg).Cd;
    }

    double S_ref = (cfg_.full.S_ref_m2 > 0.0) ? cfg_.full.S_ref_m2 : 0.0314; // Reference area for drag
    out_drag_N = q_bar * S_ref * CA;

    // Forces in body frame
    Vec3 F_thrust_b = {thrust_N, 0.0, 0.0};
    
    // In 3DOF, rocket is aligned with velocity, so drag opposes body X axis
    // Use airspeed for drag magnitude, but apply in body -X direction
    Vec3 F_aero_b = {-out_drag_N, 0.0, 0.0};
    
    Vec3 F_total_b = add(F_thrust_b, F_aero_b);

    // Rotate body forces to NED frame
    Vec3 F_total_n = rotate(current_q_b_n_, F_total_b);

    // Add gravity
    F_total_n.z += mass * cfg_.gravity_m_s2;

    // Pad reaction force
    if ((-frame_.r_n.z) <= cfg_.ground_alt_m + kEps && F_total_n.z > 0.0) {
        F_total_n.z = 0.0;
        // Keep from sliding on pad while thrust is less than gravity
        if (thrust_N < mass * cfg_.gravity_m_s2) {
            F_total_n.x = 0.0;
            F_total_n.y = 0.0;
        }
    }

    if (mass < kEps) return Vec3{};
    return scale(F_total_n, 1.0 / mass);
}

SimFrame ThreeDOFIntegrator::step()
{
    if (frame_.finished) return frame_;

    const double dt = cfg_.dt_s;
    const double t  = frame_.t_s;

    auto get_thrust = [&](double t_val) {
        // Use motor_on_curve when motor is burning, motor_off_curve when motor is off
        if (cfg_.motor_on_curve && cfg_.motor_on_curve->isLoaded() && cfg_.motor_off_curve && cfg_.motor_off_curve->isLoaded()) {
            // Check if motor is still burning based on current thrust
            auto motor_on_data = cfg_.motor_on_curve->lookup(t_val);
            if (motor_on_data.thrust_N > kEps) {
                return motor_on_data.thrust_N;
            } else {
                return cfg_.motor_off_curve->lookup(t_val).thrust_N;
            }
        } else if (cfg_.thrust_curve && cfg_.thrust_curve->isLoaded()) {
            return cfg_.thrust_curve->lookup(t_val).thrust_N;
        } else {
            return thrust_at(t_val);
        }
    };

    double drag_dummy = 0.0;
    
    // k1
    double m1  = mass_at(t);
    double Tn1 = get_thrust(t);
    double drag_N = 0.0; // Keep k1 drag for logging
    Vec3 k1_v = accel(-frame_.r_n.z, frame_.v_n, m1, Tn1, drag_N);
    Vec3 k1_r = frame_.v_n;

    // k2
    double t2 = t + 0.5 * dt;
    double m2 = mass_at(t2);
    double Tn2 = get_thrust(t2);
    Vec3 v2 = add(frame_.v_n, scale(k1_v, 0.5 * dt));
    double alt2 = -(frame_.r_n.z + k1_r.z * 0.5 * dt);
    Vec3 k2_v = accel(alt2, v2, m2, Tn2, drag_dummy);
    Vec3 k2_r = v2;

    // k3
    double t3 = t + 0.5 * dt;
    double m3 = mass_at(t3);
    double Tn3 = get_thrust(t3);
    Vec3 v3 = add(frame_.v_n, scale(k2_v, 0.5 * dt));
    double alt3 = -(frame_.r_n.z + k2_r.z * 0.5 * dt);
    Vec3 k3_v = accel(alt3, v3, m3, Tn3, drag_dummy);
    Vec3 k3_r = v3;

    // k4
    double t4 = t + dt;
    double m4 = mass_at(t4);
    double Tn4 = get_thrust(t4);
    Vec3 v4 = add(frame_.v_n, scale(k3_v, dt));
    double alt4 = -(frame_.r_n.z + k3_r.z * dt);
    Vec3 k4_v = accel(alt4, v4, m4, Tn4, drag_dummy);
    Vec3 k4_r = v4;

    // Combine
    Vec3 v_sum1 = add(k1_v, scale(k2_v, 2.0));
    Vec3 v_sum2 = add(scale(k3_v, 2.0), k4_v);
    Vec3 v_new = add(frame_.v_n, scale(add(v_sum1, v_sum2), dt / 6.0));

    Vec3 r_sum1 = add(k1_r, scale(k2_r, 2.0));
    Vec3 r_sum2 = add(scale(k3_r, 2.0), k4_r);
    Vec3 r_new = add(frame_.r_n, scale(add(r_sum1, r_sum2), dt / 6.0));

    const double m = m1;
    double Tn = Tn1;

    frame_.t_s      = t + dt;
    frame_.r_n      = r_new;
    frame_.v_n      = v_new;
    frame_.mass_kg  = m;          
    frame_.thrust_n = Tn;
    frame_.drag_n   = drag_N;
    frame_.altitude_msl_m = -frame_.r_n.z;
    frame_.speed_m_s      = vec_norm(frame_.v_n);

    // Velocity alignment threshold (50.0 m/s for rail departure)
    if (frame_.speed_m_s >= 50.0) {
        Vec3 wind_n{0.0, 0.0, 0.0};
        if (cfg_.atmosphere_table && cfg_.atmosphere_table->isLoaded()) {
            auto atmo = cfg_.atmosphere_table->lookup(frame_.altitude_msl_m);
            wind_n = {atmo.wind_north_m_s, atmo.wind_east_m_s, atmo.wind_down_m_s};
        }
        Vec3 v_air = sub(frame_.v_n, wind_n);
        double speed_air = vec_norm(v_air);
        if (speed_air > kEps) {
            double pitch = -std::asin(std::clamp(v_air.z / speed_air, -1.0, 1.0));
            double yaw = std::atan2(v_air.y, v_air.x);
            current_q_b_n_ = quat_from_euler(yaw, pitch, 0.0);
        }
    }

    if (Tn > kEps) {
        frame_.phase = FlightPhase::BoostS1;
    } else {
        if (ascending_ && frame_.v_n.z > 0.0) ascending_ = false;
        frame_.phase = ascending_ ? FlightPhase::CoastS1 : FlightPhase::Terminal;
    }

    if (frame_.t_s >= cfg_.t_end_s) {
        frame_.finished = true;
    }
    if (frame_.v_n.z > 0.0 && (-frame_.r_n.z) <= cfg_.ground_alt_m) {
        frame_.finished = true;
    }
    if (!std::isfinite(frame_.r_n.x) || !std::isfinite(frame_.v_n.z) ||
        !std::isfinite(frame_.mass_kg)) {
        frame_.finished = true;
    }

    // Atmospheric and airspeed info
    double sos = 340.29;
    double rho = cfg_.rho_kg_m3;
    Vec3 wind_n{0.0, 0.0, 0.0};
    if (cfg_.atmosphere_table && cfg_.atmosphere_table->isLoaded()) {
        auto atmo = cfg_.atmosphere_table->lookup(frame_.altitude_msl_m);
        sos = atmo.speed_of_sound_m_s;
        rho = atmo.density_kg_m3;
        wind_n = {atmo.wind_north_m_s, atmo.wind_east_m_s, atmo.wind_down_m_s};
    }
    
    Vec3 v_air = sub(frame_.v_n, wind_n);
    double speed_air = vec_norm(v_air);
    double mach = (sos > 1.0) ? (speed_air / sos) : 0.0;
    double q_bar = 0.5 * rho * speed_air * speed_air;

    Quat q_inv = {current_q_b_n_.w, -current_q_b_n_.x, -current_q_b_n_.y, -current_q_b_n_.z};
    Vec3 v_b = rotate(q_inv, frame_.v_n);
    double alpha_deg = 0.0, beta_deg = 0.0;
    if (v_b.x > kEps) {
        alpha_deg = std::atan2(v_b.z, v_b.x) * gnc::RAD2DEG;
        beta_deg = std::atan2(v_b.y, std::sqrt(v_b.x*v_b.x + v_b.z*v_b.z)) * gnc::RAD2DEG;
    }

    double roll_rad = 0.0, pitch_rad = 0.0, yaw_rad = 0.0;
    euler_from_quat(current_q_b_n_, roll_rad, pitch_rad, yaw_rad);

    // Populate 103-variable log_row mapping for 3DOF
    frame_.log_row = {};
    frame_.log_row.time_s = frame_.t_s;
    frame_.log_row.mass_kg = frame_.mass_kg;
    frame_.log_row.altitude_m = frame_.altitude_msl_m;
    frame_.log_row.velocity_total_m_s = frame_.speed_m_s;
    frame_.log_row.velocity_x_m_s = frame_.v_n.x;
    frame_.log_row.velocity_y_m_s = frame_.v_n.y;
    frame_.log_row.velocity_z_m_s = frame_.v_n.z;
    frame_.log_row.position_x_m = frame_.r_n.x;
    frame_.log_row.position_y_m = frame_.r_n.y;
    frame_.log_row.position_z_m = frame_.r_n.z;
    frame_.log_row.ground_range_m = std::sqrt(frame_.r_n.x * frame_.r_n.x + frame_.r_n.y * frame_.r_n.y);

    frame_.log_row.alpha_rad = alpha_deg * gnc::DEG2RAD;
    frame_.log_row.alpha_deg = alpha_deg;
    frame_.log_row.beta_rad = beta_deg * gnc::DEG2RAD;
    frame_.log_row.beta_deg = beta_deg;
    frame_.log_row.mach = mach;
    frame_.log_row.mach_aero = mach;
    frame_.log_row.q_dynamic_Pa = q_bar;
    frame_.log_row.airspeed_m_s = speed_air;

    // Explicitly zero rotational and actuation dynamics
    frame_.log_row.omega_x_rad_s = 0.0;
    frame_.log_row.omega_y_rad_s = 0.0;
    frame_.log_row.omega_z_rad_s = 0.0;
    frame_.log_row.fin1_deflection_deg = 0.0;
    frame_.log_row.fin2_deflection_deg = 0.0;
    frame_.log_row.fin3_deflection_deg = 0.0;
    frame_.log_row.fin4_deflection_deg = 0.0;

    frame_.pitch_deg = pitch_rad * gnc::RAD2DEG;
    frame_.yaw_deg = yaw_rad * gnc::RAD2DEG;
    frame_.roll_deg = roll_rad * gnc::RAD2DEG;

    frame_.log_row.pitch_deg = frame_.pitch_deg;
    frame_.log_row.yaw_deg = frame_.yaw_deg;
    frame_.log_row.roll_deg = frame_.roll_deg;

    frame_.log_row.quat_w = current_q_b_n_.w;
    frame_.log_row.quat_x = current_q_b_n_.x;
    frame_.log_row.quat_y = current_q_b_n_.y;
    frame_.log_row.quat_z = current_q_b_n_.z;

    frame_.log_row.thrust_x_N = frame_.thrust_n;
    frame_.log_row.thrust_y_N = 0.0;
    frame_.log_row.thrust_z_N = 0.0;
    frame_.log_row.force_x_N = frame_.thrust_n - frame_.drag_n;
    frame_.log_row.force_y_N = 0.0;
    frame_.log_row.flight_phase = static_cast<double>(frame_.phase);

    // Compute ECEF position and Geodetic LLA for telemetry
    {
        EarthModel earth_model(cfg_.earth_params);
        frame_.r_ecef = earth_model.ned_to_ecef(frame_.r_n);
        GeodeticLLA lla = earth_model.ecef_to_lla(frame_.r_ecef);
        frame_.lat_deg = lla.lat_rad * gnc::RAD2DEG;
        frame_.lon_deg = lla.lon_rad * gnc::RAD2DEG;

        frame_.log_row.lat_deg = frame_.lat_deg;
        frame_.log_row.lon_deg = frame_.lon_deg;
        frame_.log_row.alt_msl_m = frame_.altitude_msl_m;
    }

    return frame_;
}

}  // namespace gnc::sim

