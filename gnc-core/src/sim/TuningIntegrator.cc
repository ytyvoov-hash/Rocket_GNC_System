#include "gnc-core/sim/TuningIntegrator.h"
#include <cmath>

namespace gnc::sim {

namespace {

// Basic vector math
Vec3 add(Vec3 a, Vec3 b) { return {a.x+b.x, a.y+b.y, a.z+b.z}; }
Vec3 sub(Vec3 a, Vec3 b) { return {a.x-b.x, a.y-b.y, a.z-b.z}; }
Vec3 scale(Vec3 a, double s) { return {a.x*s, a.y*s, a.z*s}; }
Vec3 cross(Vec3 a, Vec3 b) { return {a.y*b.z - a.z*b.y, a.z*b.x - a.x*b.z, a.x*b.y - a.y*b.x}; }
double dot(Vec3 a, Vec3 b) { return a.x*b.x + a.y*b.y + a.z*b.z; }
double norm(Vec3 a) { return std::sqrt(dot(a, a)); }

Quat normalize(Quat q) {
    double n = std::sqrt(q.w*q.w + q.x*q.x + q.y*q.y + q.z*q.z);
    if (n < 1e-12) return {1,0,0,0};
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

Vec3 mult(const Matrix3x3& m, Vec3 v) {
    return {
        m.m[0][0]*v.x + m.m[0][1]*v.y + m.m[0][2]*v.z,
        m.m[1][0]*v.x + m.m[1][1]*v.y + m.m[1][2]*v.z,
        m.m[2][0]*v.x + m.m[2][1]*v.y + m.m[2][2]*v.z
    };
}

// Full 3x3 matrix inverse
Matrix3x3 inv3x3(const Matrix3x3& m) {
    double det =
        m.m[0][0] * (m.m[1][1]*m.m[2][2] - m.m[1][2]*m.m[2][1]) -
        m.m[0][1] * (m.m[1][0]*m.m[2][2] - m.m[1][2]*m.m[2][0]) +
        m.m[0][2] * (m.m[1][0]*m.m[2][1] - m.m[1][1]*m.m[2][0]);
    if (std::abs(det) < 1e-20) return {}; // Singular
    double inv_det = 1.0 / det;
    Matrix3x3 r;
    r.m[0][0] =  (m.m[1][1]*m.m[2][2] - m.m[1][2]*m.m[2][1]) * inv_det;
    r.m[0][1] = -(m.m[0][1]*m.m[2][2] - m.m[0][2]*m.m[2][1]) * inv_det;
    r.m[0][2] =  (m.m[0][1]*m.m[1][2] - m.m[0][2]*m.m[1][1]) * inv_det;
    r.m[1][0] = -(m.m[1][0]*m.m[2][2] - m.m[1][2]*m.m[2][0]) * inv_det;
    r.m[1][1] =  (m.m[0][0]*m.m[2][2] - m.m[0][2]*m.m[2][0]) * inv_det;
    r.m[1][2] = -(m.m[0][0]*m.m[1][2] - m.m[0][2]*m.m[1][0]) * inv_det;
    r.m[2][0] =  (m.m[1][0]*m.m[2][1] - m.m[1][1]*m.m[2][0]) * inv_det;
    r.m[2][1] = -(m.m[0][0]*m.m[2][1] - m.m[0][1]*m.m[2][0]) * inv_det;
    r.m[2][2] =  (m.m[0][0]*m.m[1][1] - m.m[0][1]*m.m[1][0]) * inv_det;
    return r;
}

struct State {
    Vec3 r; Vec3 v; Quat q; Vec3 w; double m;
    double pid_integral;
};

struct Derivative {
    Vec3 dr; Vec3 dv; Quat dq; Vec3 dw; double dm;
    double dpid_integral;
};

Derivative compute_derivative(const State& s, const SimConfig& cfg, double t) {
    Derivative d;
    d.dr = s.v;

    double alt = -s.r.z;
    AtmosphereData atmo;
    if (cfg.atmosphere_table) {
        atmo = cfg.atmosphere_table->lookup(alt);
    } else {
        atmo = {alt, 101325.0, 288.15, 1.225, 340.29, 0,0,0};
    }

    ThrustData thrust_data{t, 0.0, 0.0};
    if (cfg.thrust_curve) {
        thrust_data = cfg.thrust_curve->lookup(t);
    } else if (t <= cfg.burn_time_s) {
        thrust_data = {t, cfg.thrust_N, (cfg.mass_init_kg - cfg.mass_dry_kg) / cfg.burn_time_s};
    }
    
    if (s.m <= cfg.mass_dry_kg) {
        thrust_data.thrust_N = 0.0;
        thrust_data.mass_flow_kg_s = 0.0;
    }

    Vec3 F_b{0,0,0};
    Vec3 M_b{0,0,0};

    Vec3 thrust_dir_b = {0, 0, -1};
    F_b = add(F_b, scale(thrust_dir_b, thrust_data.thrust_N));

    Vec3 g_n = {0, 0, cfg.gravity_m_s2};
    Vec3 F_g_n = scale(g_n, s.m);
    
    Vec3 wind_n = {atmo.wind_north_m_s, atmo.wind_east_m_s, atmo.wind_down_m_s};
    Vec3 v_rel_n = sub(s.v, wind_n);
    Vec3 v_rel_b = rotate({s.q.w, -s.q.x, -s.q.y, -s.q.z}, v_rel_n);
    
    double v_rel_norm = norm(v_rel_b);
    double mach = v_rel_norm / atmo.speed_of_sound_m_s;
    double q_dyn = 0.5 * atmo.density_kg_m3 * v_rel_norm * v_rel_norm;
    
    double V_axial = -v_rel_b.z;
    double V_normal = std::sqrt(v_rel_b.x*v_rel_b.x + v_rel_b.y*v_rel_b.y);
    double alpha_deg = 0.0;
    if (V_axial > 1e-3) {
        alpha_deg = std::atan2(V_normal, V_axial) * gnc::RAD2DEG;
    }

    AeroData aero{mach, alpha_deg, 0.4, 0.0, 0.0};
    if (cfg.aero_coeffs) aero = cfg.aero_coeffs->lookup(mach, alpha_deg);
    
    if (v_rel_norm > 1e-3) {
        Vec3 drag_dir_b = scale(v_rel_b, -1.0/v_rel_norm);
        double S_ref = (cfg.full.S_ref_m2 > 0.0) ? cfg.full.S_ref_m2 : 0.0314;
        F_b = add(F_b, scale(drag_dir_b, q_dyn * S_ref * aero.Cd));
    }

    // Extract pitch for PID tuning
    double pitch_deg = std::asin(2.0 * (s.q.w*s.q.y - s.q.z*s.q.x)) * gnc::RAD2DEG;
    
    // Simple PID controller targeting pitch = 0
    double error = 0.0 - pitch_deg; // target - current
    double p_term = cfg.tuning.pid_gains.kp * error;
    double i_term = cfg.tuning.pid_gains.ki * s.pid_integral;
    double d_term = cfg.tuning.pid_gains.kd * (-s.w.y * gnc::RAD2DEG); // rate
    
    double control_torque = p_term + i_term + d_term;
    M_b.y += control_torque; // Apply torque to pitch axis
    
    d.dpid_integral = error; // accumulate error
    // Anti-windup: clamp integral term
    double max_integral = 100.0; // Maximum integral magnitude
    if (std::abs(s.pid_integral + error * 0.01) > max_integral) {
        d.dpid_integral = 0.0; // Freeze integral
    }

    Vec3 F_total_n = add(rotate(s.q, F_b), F_g_n);
    d.dv = scale(F_total_n, 1.0 / s.m);

    d.dq.w = -0.5 * (s.q.x * s.w.x + s.q.y * s.w.y + s.q.z * s.w.z);
    d.dq.x =  0.5 * (s.q.w * s.w.x - s.q.z * s.w.y + s.q.y * s.w.z);
    d.dq.y =  0.5 * (s.q.z * s.w.x + s.q.w * s.w.y - s.q.x * s.w.z);
    d.dq.z = -0.5 * (s.q.y * s.w.x - s.q.x * s.w.y - s.q.w * s.w.z);

    Matrix3x3 I = cfg.full.inertia_wet;
    if (I.m[0][0] == 0) I.m[0][0] = 1.0;
    if (I.m[1][1] == 0) I.m[1][1] = 1.0;
    if (I.m[2][2] == 0) I.m[2][2] = 1.0;
    
    Matrix3x3 I_inv = inv3x3(I);
    Vec3 Iw = mult(I, s.w);
    Vec3 M_net = sub(M_b, cross(s.w, Iw));
    d.dw = mult(I_inv, M_net);

    d.dm = -thrust_data.mass_flow_kg_s;

    return d;
}

State rk4_step(const State& s, const SimConfig& cfg, double t, double dt) {
    Derivative k1 = compute_derivative(s, cfg, t);
    
    State s2 = {
        add(s.r, scale(k1.dr, dt*0.5)),
        add(s.v, scale(k1.dv, dt*0.5)),
        {s.q.w + k1.dq.w*dt*0.5, s.q.x + k1.dq.x*dt*0.5, s.q.y + k1.dq.y*dt*0.5, s.q.z + k1.dq.z*dt*0.5},
        add(s.w, scale(k1.dw, dt*0.5)),
        s.m + k1.dm * dt * 0.5,
        s.pid_integral + k1.dpid_integral * dt * 0.5
    };
    s2.q = normalize(s2.q);
    Derivative k2 = compute_derivative(s2, cfg, t + dt*0.5);

    State s3 = {
        add(s.r, scale(k2.dr, dt*0.5)),
        add(s.v, scale(k2.dv, dt*0.5)),
        {s.q.w + k2.dq.w*dt*0.5, s.q.x + k2.dq.x*dt*0.5, s.q.y + k2.dq.y*dt*0.5, s.q.z + k2.dq.z*dt*0.5},
        add(s.w, scale(k2.dw, dt*0.5)),
        s.m + k2.dm * dt * 0.5,
        s.pid_integral + k2.dpid_integral * dt * 0.5
    };
    s3.q = normalize(s3.q);
    Derivative k3 = compute_derivative(s3, cfg, t + dt*0.5);

    State s4 = {
        add(s.r, scale(k3.dr, dt)),
        add(s.v, scale(k3.dv, dt)),
        {s.q.w + k3.dq.w*dt, s.q.x + k3.dq.x*dt, s.q.y + k3.dq.y*dt, s.q.z + k3.dq.z*dt},
        add(s.w, scale(k3.dw, dt)),
        s.m + k3.dm * dt,
        s.pid_integral + k3.dpid_integral * dt
    };
    s4.q = normalize(s4.q);
    Derivative k4 = compute_derivative(s4, cfg, t + dt);

    State sf;
    sf.r = add(s.r, scale(add(k1.dr, add(scale(k2.dr, 2.0), add(scale(k3.dr, 2.0), k4.dr))), dt/6.0));
    sf.v = add(s.v, scale(add(k1.dv, add(scale(k2.dv, 2.0), add(scale(k3.dv, 2.0), k4.dv))), dt/6.0));
    
    sf.q.w = s.q.w + (k1.dq.w + 2*k2.dq.w + 2*k3.dq.w + k4.dq.w) * dt / 6.0;
    sf.q.x = s.q.x + (k1.dq.x + 2*k2.dq.x + 2*k3.dq.x + k4.dq.x) * dt / 6.0;
    sf.q.y = s.q.y + (k1.dq.y + 2*k2.dq.y + 2*k3.dq.y + k4.dq.y) * dt / 6.0;
    sf.q.z = s.q.z + (k1.dq.z + 2*k2.dq.z + 2*k3.dq.z + k4.dq.z) * dt / 6.0;
    sf.q = normalize(sf.q);

    sf.w = add(s.w, scale(add(k1.dw, add(scale(k2.dw, 2.0), add(scale(k3.dw, 2.0), k4.dw))), dt/6.0));
    sf.m = s.m + (k1.dm + 2*k2.dm + 2*k3.dm + k4.dm) * dt / 6.0;
    sf.pid_integral = s.pid_integral + (k1.dpid_integral + 2*k2.dpid_integral + 2*k3.dpid_integral + k4.dpid_integral) * dt / 6.0;

    return sf;
}

} // namespace

TuningIntegrator::TuningIntegrator(SimConfig cfg)
    : cfg_(std::move(cfg))
{
    reset();
}

void TuningIntegrator::reset()
{
    frame_ = SimFrame{};
    frame_.r_n = cfg_.r0_n;
    frame_.v_n = cfg_.v0_n;
    frame_.mass_kg = cfg_.mass_init_kg;
    // Initial 10 degree pitch to show tuning
    frame_.q_b_n = cfg_.q0_b_n;
    frame_.omega_b_b = {0, 0, 0};
    frame_.t_s = 0.0;
}

SimFrame TuningIntegrator::step()
{
    State s;
    s.r = frame_.r_n;
    s.v = frame_.v_n;
    s.q = frame_.q_b_n;
    s.w = frame_.omega_b_b;
    s.m = frame_.mass_kg;
    s.pid_integral = 0; // State carries integral, we'll just track it inside RK4, wait we need to persist it.
    
    // Oh, wait, the integral needs to persist across steps!
    // For simplicity, let's keep integral state in frame_.control_output or add a new field.
    // Or just store it in a static member, no, store it in class member!
    s.pid_integral = pid_integral_state_;

    State sf = rk4_step(s, cfg_, frame_.t_s, cfg_.dt_s);

    pid_integral_state_ = sf.pid_integral;

    frame_.t_s += cfg_.dt_s;
    frame_.r_n = sf.r;
    frame_.v_n = sf.v;
    frame_.q_b_n = sf.q;
    frame_.omega_b_b = sf.w;
    frame_.mass_kg = sf.m;
    frame_.altitude_msl_m = -sf.r.z;
    frame_.speed_m_s = norm(sf.v);

    ThrustData td = cfg_.thrust_curve ? cfg_.thrust_curve->lookup(frame_.t_s) : ThrustData{};
    if (td.thrust_N > 1e-6 && sf.m > cfg_.mass_dry_kg) {
        frame_.phase = FlightPhase::BoostS1;
    } else {
        if (sf.v.z > 0.0) {
            frame_.phase = FlightPhase::Terminal;
        } else {
            frame_.phase = FlightPhase::CoastS1;
        }
    }

    double sqw = sf.q.w*sf.q.w;
    double sqx = sf.q.x*sf.q.x;
    double sqy = sf.q.y*sf.q.y;
    double sqz = sf.q.z*sf.q.z;
    frame_.pitch_deg = std::asin(2.0 * (sf.q.w*sf.q.y - sf.q.z*sf.q.x)) * gnc::RAD2DEG;
    frame_.yaw_deg = std::atan2(2.0 * (sf.q.w*sf.q.z + sf.q.x*sf.q.y), 1.0 - 2.0*(sqy + sqz)) * gnc::RAD2DEG;
    frame_.roll_deg = std::atan2(2.0 * (sf.q.w*sf.q.x + sf.q.y*sf.q.z), 1.0 - 2.0*(sqx + sqy)) * gnc::RAD2DEG;

    // output control effort for telemetry
    double error = 0.0 - frame_.pitch_deg;
    frame_.control_output = cfg_.tuning.pid_gains.kp * error + cfg_.tuning.pid_gains.ki * pid_integral_state_ + cfg_.tuning.pid_gains.kd * (-sf.w.y * gnc::RAD2DEG);

    if (frame_.altitude_msl_m <= cfg_.ground_alt_m && frame_.v_n.z > 0 && frame_.t_s > 1.0) {
        frame_.finished = true;
    }
    if (frame_.t_s >= cfg_.t_end_s) {
        frame_.finished = true;
    }

    // Compute ECEF position and Geodetic LLA for telemetry
    {
        EarthModel earth_model(cfg_.earth_params);
        frame_.r_ecef = earth_model.ned_to_ecef(frame_.r_n);
        GeodeticLLA lla = earth_model.ecef_to_lla(frame_.r_ecef);
        frame_.lat_deg = lla.lat_rad * gnc::RAD2DEG;
        frame_.lon_deg = lla.lon_rad * gnc::RAD2DEG;
    }

    return frame_;
}

void TuningIntegrator::updateTuningParams(const TuningParams& params)
{
    cfg_.tuning.pid_gains = params;
}

}  // namespace gnc::sim
