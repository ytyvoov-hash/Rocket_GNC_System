#include "gnc-core/sim/Full6DOFIntegrator.h"
#include "gnc-core/control/ControllerFactory.h"
#include <algorithm>
#include <cmath>

namespace gnc::sim {

namespace {

// Basic vector math
Vec3 add(Vec3 a, Vec3 b) { return {a.x+b.x, a.y+b.y, a.z+b.z}; }
Vec3 sub(Vec3 a, Vec3 b) { return {a.x-b.x, a.y-b.y, a.z-b.z}; }
Vec3 scale(Vec3 a, double s) { return {a.x*s, a.y*s, a.z*s}; }
Vec3 cross(Vec3 a, Vec3 b) {
    return {
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    };
}
double dot(Vec3 a, Vec3 b) { return a.x*b.x + a.y*b.y + a.z*b.z; }
double norm(Vec3 a) { return std::sqrt(dot(a, a)); }
Vec3 normalize(Vec3 a) {
    double n = norm(a);
    if (n < 1e-12) return {0,0,0};
    return scale(a, 1.0/n);
}

// Quat math
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

// Rotate vector v by quaternion q (q * v * q^-1)
Vec3 rotate(Quat q, Vec3 v) {
    Quat qv{0, v.x, v.y, v.z};
    Quat q_inv{q.w, -q.x, -q.y, -q.z};
    Quat r = mult(mult(q, qv), q_inv);
    return {r.x, r.y, r.z};
}

// Matrix-vector mult
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
    Vec3 r;
    Vec3 v;
    Quat q;
    Vec3 w;
    double m;
};

struct Derivative {
    Vec3 dr;
    Vec3 dv;
    Quat dq;
    Vec3 dw;
    double dm;
};

Derivative compute_derivative(const State& s, const SimConfig& cfg, const gnc::control::ActuatorCommands& cmds, double t, const EarthModel& earth_model) {
    Derivative d;
    d.dr = s.v;

    // Mathematical Safeguards: Check for NaN
    if (std::isnan(s.r.x) || std::isnan(s.v.x) || std::isnan(s.q.w) || std::isnan(s.w.x)) {
        d.dr = {0,0,0}; d.dv = {0,0,0}; d.dq = {0,0,0,0}; d.dw = {0,0,0}; d.dm = 0;
        return d;
    }

    // Environmental table lookup
    double alt = -s.r.z;
    AtmosphereData atmo;
    if (cfg.atmosphere_table) {
        atmo = cfg.atmosphere_table->lookup(alt);
    } else {
        atmo = {alt, 101325.0, 288.15, 1.225, 340.29, 0,0,0};
    }

    // Mass Properties Interpolation
    double mass_range = cfg.mass_init_kg - cfg.mass_dry_kg;
    double f = 0.0;
    if (mass_range > 1e-6) {
        f = (s.m - cfg.mass_dry_kg) / mass_range;
        if (f < 0.0) f = 0.0;
        if (f > 1.0) f = 1.0;
    }

    Vec3 cg = add(scale(cfg.full.cg_dry_m, 1.0 - f), scale(cfg.full.cg_wet_m, f));
    Matrix3x3 I;
    for (int r = 0; r < 3; ++r) {
        for (int c = 0; c < 3; ++c) {
            I.m[r][c] = cfg.full.inertia_dry.m[r][c] * (1.0 - f) + cfg.full.inertia_wet.m[r][c] * f;
        }
    }

    // Thrust table lookup
    ThrustData thrust_data{t, 0.0, 0.0};
    // Use motor_on_curve when motor is burning, motor_off_curve when motor is off
    if (cfg.motor_on_curve && cfg.motor_on_curve->isLoaded() && cfg.motor_off_curve && cfg.motor_off_curve->isLoaded()) {
        auto motor_on_data = cfg.motor_on_curve->lookup(t);
        if (motor_on_data.thrust_N > 1e-6) {
            thrust_data = motor_on_data;
        } else {
            thrust_data = cfg.motor_off_curve->lookup(t);
        }
    } else if (cfg.thrust_curve && cfg.thrust_curve->isLoaded()) {
        thrust_data = cfg.thrust_curve->lookup(t);
    } else if (t <= cfg.burn_time_s) {
        thrust_data = {t, cfg.thrust_N, (cfg.mass_init_kg - cfg.mass_dry_kg) / cfg.burn_time_s};
    }
    
    // Stop burning if out of fuel
    if (s.m <= cfg.mass_dry_kg) {
        thrust_data.thrust_N = 0.0;
        thrust_data.mass_flow_kg_s = 0.0;
    }

    // Forces and Moments in Body frame
    Vec3 F_b{0,0,0};
    Vec3 M_b{0,0,0};

    // Thrust (assumed along body -Z axis)
    Vec3 thrust_dir_b = {0, 0, -1};
    Vec3 thrust_vec_b = scale(thrust_dir_b, thrust_data.thrust_N);
    F_b = add(F_b, thrust_vec_b);

    // Thrust Moment
    Vec3 r_thrust_cg = sub(cfg.full.r_thrust_m, cg);
    M_b = add(M_b, cross(r_thrust_cg, thrust_vec_b));

    // Gravity, Coriolis, and Centrifugal Forces in NED (Using J2 EarthModel and ECEF if enabled)
    Vec3 g_n;
    Vec3 f_coriolis_centrifugal;
    if (cfg.use_ecef) {
        Vec3 r_ecef = earth_model.ned_to_ecef(s.r);
        GeodeticLLA lla = earth_model.ecef_to_lla(r_ecef);
        
        Vec3 g_ecef = earth_model.compute_gravity_ecef(r_ecef);
        Matrix3x3 D = earth_model.dcm_ned_to_ecef(lla.lat_rad, lla.lon_rad);
        g_n = {
            D.m[0][0]*g_ecef.x + D.m[1][0]*g_ecef.y + D.m[2][0]*g_ecef.z,
            D.m[0][1]*g_ecef.x + D.m[1][1]*g_ecef.y + D.m[2][1]*g_ecef.z,
            D.m[0][2]*g_ecef.x + D.m[1][2]*g_ecef.y + D.m[2][2]*g_ecef.z
        };

        // Coriolis & Centrifugal forces at actual lat/lon/altitude
        double lat = lla.lat_rad;
        constexpr double OMEGA_E = 7.292115e-5;
        Vec3 omega_e = {
            OMEGA_E * std::cos(lat),
            0.0,
            -OMEGA_E * std::sin(lat)
        };
        Vec3 coriolis = {
            -2.0 * (omega_e.y * s.v.z - omega_e.z * s.v.y),
            -2.0 * (omega_e.z * s.v.x - omega_e.x * s.v.z),
            -2.0 * (omega_e.x * s.v.y - omega_e.y * s.v.x)
        };
        
        // Prime vertical radius of curvature (using cached constants or WGS84 formula)
        // WGS84: RE = 6378137.0, F = 1/298.257223563, E2 = 2F - F*F
        double slat = std::sin(lat);
        double N = 6378137.0 / std::sqrt(1.0 - 0.00669437999014 * slat * slat);
        double h = lla.alt_m;
        
        Vec3 R_vec_actual = { s.r.x, s.r.y, -(N + h) + s.r.z };
        Vec3 wxR = {
            omega_e.y * R_vec_actual.z - omega_e.z * R_vec_actual.y,
            omega_e.z * R_vec_actual.x - omega_e.x * R_vec_actual.z,
            omega_e.x * R_vec_actual.y - omega_e.y * R_vec_actual.x
        };
        Vec3 wx_wxR = {
            omega_e.y * wxR.z - omega_e.z * wxR.y,
            omega_e.z * wxR.x - omega_e.x * wxR.z,
            omega_e.x * wxR.y - omega_e.y * wxR.x
        };
        
        f_coriolis_centrifugal = scale({
            coriolis.x - wx_wxR.x,
            coriolis.y - wx_wxR.y,
            coriolis.z - wx_wxR.z
        }, s.m);
    } else {
        g_n = earth_model.compute_gravity_ned(s.r);
        f_coriolis_centrifugal = scale(earth_model.compute_coriolis_centrifugal_ned(s.r, s.v), s.m);
    }
    Vec3 F_g_n = add(scale(g_n, s.m), f_coriolis_centrifugal);
    
    // Aerodynamics
    Vec3 wind_n = {atmo.wind_north_m_s, atmo.wind_east_m_s, atmo.wind_down_m_s};
    Vec3 v_rel_n = sub(s.v, wind_n);
    
    Quat q_inv = {s.q.w, -s.q.x, -s.q.y, -s.q.z};
    Vec3 v_rel_b = rotate(q_inv, v_rel_n);
    
    double v_rel_norm = norm(v_rel_b);
    double mach = v_rel_norm / (atmo.speed_of_sound_m_s > 0 ? atmo.speed_of_sound_m_s : 340.29);
    double q_dyn = 0.5 * atmo.density_kg_m3 * v_rel_norm * v_rel_norm;
    
    // Alpha, Beta
    double u = v_rel_b.x;
    double v = v_rel_b.y;
    double w_vel = v_rel_b.z; 
    
    double V_axial = -w_vel;
    double V_normal = std::sqrt(u*u + v*v);
    double alpha_deg = 0.0;
    if (V_axial > 1e-3) {
        alpha_deg = std::atan2(V_normal, V_axial) * gnc::RAD2DEG;
    }

    AeroData aero{mach, alpha_deg, 0.4, 0.0, 0.0};
    std::shared_ptr<AeroCoeffs> active_aero = cfg.aero_coeffs;
    if (thrust_data.thrust_N > 1e-6) {
        if (cfg.aero_coeffs_motor_on && cfg.aero_coeffs_motor_on->isLoaded()) {
            active_aero = cfg.aero_coeffs_motor_on;
        }
    } else {
        if (cfg.aero_coeffs_motor_off && cfg.aero_coeffs_motor_off->isLoaded()) {
            active_aero = cfg.aero_coeffs_motor_off;
        }
    }
    if (active_aero && active_aero->isLoaded()) {
        aero = active_aero->lookup(mach, alpha_deg);
    }
    
    double S_ref = cfg.full.S_ref_m2 > 0 ? cfg.full.S_ref_m2 : cfg.cd_A_m2;
    double L_ref = cfg.full.L_ref_m > 0 ? cfg.full.L_ref_m : 1.0;

    if (v_rel_norm > 1e-3) {
        Vec3 drag_dir_b = scale(v_rel_b, -1.0/v_rel_norm);
        Vec3 F_aero_b = scale(drag_dir_b, q_dyn * S_ref * aero.Cd);
        F_b = add(F_b, F_aero_b);

        Vec3 M_aero_b{0,0,0};
        M_aero_b.x = q_dyn * S_ref * L_ref * aero.Cn;
        M_aero_b.y = q_dyn * S_ref * L_ref * aero.Cm;
        M_aero_b.z = 0.0; 

        // Apply Damping (assuming z is axial/roll, y is pitch, x is yaw)
        if (cfg.damping_coeffs && cfg.damping_coeffs->isLoaded()) {
            DampingData damp = cfg.damping_coeffs->lookup(mach, alpha_deg);
            double L_2V = L_ref / (2.0 * v_rel_norm); 
            M_aero_b.x += q_dyn * S_ref * L_ref * damp.Cnq * (s.w.x * L_2V); // Yaw damping
            M_aero_b.y += q_dyn * S_ref * L_ref * damp.Cmq * (s.w.y * L_2V); // Pitch damping
            M_aero_b.z += q_dyn * S_ref * L_ref * damp.Clp * (s.w.z * L_2V); // Roll damping
        }

        // v8 P3.2 — delta-dependent control-surface aero. The commanded fin
        // deflections map (via the allocator geometry) to an equivalent
        // deflection per axis; that indexes the delta-swept aero deck so the
        // realised control moment is sourced from aero data rather than the
        // allocator's own linear estimate. Gated by delta_aero_from_table; when
        // off the legacy zero-deflection lookup is preserved exactly.
        const bool use_delta_aero =
            cfg.delta_aero_from_table &&
            cfg.fin_deflection_coeffs && cfg.fin_deflection_coeffs->isLoaded();

        Vec3 def_eq{0.0, 0.0, 0.0}; // {roll, pitch, yaw} equivalent deflection (rad)
        if (use_delta_aero && cfg.allocator) {
            def_eq = cfg.allocator->equivalentDeflections(cmds);
        }

        // Apply Fin Deflection. Legacy path (use_delta_aero == false) indexes
        // the deck at 0 deg, as before; the delta path uses the commanded
        // pitch/yaw equivalent deflection and applies the resulting moments
        // with the correct sign (the deck is tabulated for |delta|).
        if (cfg.fin_deflection_coeffs && cfg.fin_deflection_coeffs->isLoaded()) {
            const double dp_deg = use_delta_aero ? def_eq.y * gnc::RAD2DEG : 0.0; // pitch
            const double dy_deg = use_delta_aero ? def_eq.z * gnc::RAD2DEG : 0.0; // yaw
            const double sp = dp_deg >= 0.0 ? 1.0 : -1.0;
            const double sy = dy_deg >= 0.0 ? 1.0 : -1.0;
            FinDeflectionData fp = cfg.fin_deflection_coeffs->lookup(mach, std::abs(dp_deg));
            FinDeflectionData fy = cfg.fin_deflection_coeffs->lookup(mach, std::abs(dy_deg));
            M_aero_b.y += sp * q_dyn * S_ref * L_ref * fp.Cmd; // pitch control moment
            if (use_delta_aero) {
                // Yaw shares the fin moment derivative by cruciform symmetry.
                M_aero_b.x += sy * q_dyn * S_ref * L_ref * fy.Cmd;
            }
            // Normal-force coupling (Cnd) is left to a follow-up; for the
            // committed decks it is ~1-2 orders of magnitude below the moment
            // term and its body-axis sign needs validation against a golden run.
        }

        // Apply Roll Aero Coupling at the commanded roll-equivalent deflection.
        bool roll_from_table = false;
        if (cfg.roll_aero_coeffs && cfg.roll_aero_coeffs->isLoaded()) {
            const double def_roll_deg = use_delta_aero ? def_eq.x * gnc::RAD2DEG : 0.0;
            RollAeroData roll_data = cfg.roll_aero_coeffs->lookup(mach, alpha_deg, def_roll_deg);
            M_aero_b.z += q_dyn * S_ref * L_ref * roll_data.Cll;
            roll_from_table = use_delta_aero;
        }

        Vec3 r_cp_cg = sub(cfg.full.r_cp_m, cg);
        Vec3 M_cp = cross(r_cp_cg, F_aero_b);
        M_aero_b = add(M_aero_b, M_cp);

        M_b = add(M_b, M_aero_b);

        // Allocator-sourced control moment for the axes NOT taken from the aero
        // deck. With delta-aero off this is the full allocated moment (legacy);
        // with it on, pitch/yaw (and roll, if a roll deck is loaded) are already
        // injected from the deck above, so they are zeroed here to avoid double
        // counting.
        Vec3 mc = cmds.allocated_aero_moment;
        if (use_delta_aero) { mc.x = 0.0; mc.y = 0.0; }
        if (roll_from_table) { mc.z = 0.0; }
        M_b = add(M_b, mc);
        M_b = add(M_b, cmds.allocated_thrust_moment);
    }
    else {
        // No relative airflow: no aero control authority, only thrust-vector.
        M_b = add(M_b, cmds.allocated_thrust_moment);
    }

    // Transform forces to NED
    Vec3 F_aero_prop_n = rotate(s.q, F_b);
    Vec3 F_total_n = add(F_aero_prop_n, F_g_n);

    // Safeguard Division by Zero for Mass
    double safe_mass = s.m > 0.001 ? s.m : 0.001;
    d.dv = scale(F_total_n, 1.0 / safe_mass);

    // Kinematic equation for quaternion
    d.dq.w = -0.5 * (s.q.x * s.w.x + s.q.y * s.w.y + s.q.z * s.w.z);
    d.dq.x =  0.5 * (s.q.w * s.w.x - s.q.z * s.w.y + s.q.y * s.w.z);
    d.dq.y =  0.5 * (s.q.z * s.w.x + s.q.w * s.w.y - s.q.x * s.w.z);
    d.dq.z = -0.5 * (s.q.y * s.w.x - s.q.x * s.w.y - s.q.w * s.w.z);

    // Inertia Singularity Protection
    if (std::abs(I.m[0][0]) < 1e-6) I.m[0][0] = 1.0;
    if (std::abs(I.m[1][1]) < 1e-6) I.m[1][1] = 1.0;
    if (std::abs(I.m[2][2]) < 1e-6) I.m[2][2] = 1.0;
    
    Matrix3x3 I_inv = inv3x3(I);
    Vec3 Iw = mult(I, s.w);
    Vec3 wxIw = cross(s.w, Iw);
    Vec3 M_net = sub(M_b, wxIw);
    d.dw = mult(I_inv, M_net);

    d.dm = -thrust_data.mass_flow_kg_s;

    // Launch rail constraint (50.0 m/s threshold)
    double speed = norm(s.v);
    if (speed < 50.0) {
        d.dq = {0.0, 0.0, 0.0, 0.0};
        d.dw = {0.0, 0.0, 0.0};
        
        Vec3 launch_dir_n = normalize(rotate(cfg.q0_b_n, {0.0, 0.0, -1.0}));
        double acc_rail = dot(d.dv, launch_dir_n);
        // Prevent moving backwards on the launch pad
        if (acc_rail < 0.0 && (-s.r.z) <= cfg.ground_alt_m + 1e-3) {
            acc_rail = 0.0;
        }
        d.dv = scale(launch_dir_n, acc_rail);
        d.dr = scale(launch_dir_n, std::max(0.0, dot(s.v, launch_dir_n)));
    }

    return d;
}

State rk4_step(const State& s, const SimConfig& cfg, const gnc::control::ActuatorCommands& cmds, double t, double dt, const EarthModel& earth_model) {
    Derivative k1 = compute_derivative(s, cfg, cmds, t, earth_model);
    
    State s2 = {
        add(s.r, scale(k1.dr, dt*0.5)),
        add(s.v, scale(k1.dv, dt*0.5)),
        {s.q.w + k1.dq.w*dt*0.5, s.q.x + k1.dq.x*dt*0.5, s.q.y + k1.dq.y*dt*0.5, s.q.z + k1.dq.z*dt*0.5},
        add(s.w, scale(k1.dw, dt*0.5)),
        s.m + k1.dm * dt * 0.5
    };
    s2.q = normalize(s2.q);
    Derivative k2 = compute_derivative(s2, cfg, cmds, t + dt*0.5, earth_model);

    State s3 = {
        add(s.r, scale(k2.dr, dt*0.5)),
        add(s.v, scale(k2.dv, dt*0.5)),
        {s.q.w + k2.dq.w*dt*0.5, s.q.x + k2.dq.x*dt*0.5, s.q.y + k2.dq.y*dt*0.5, s.q.z + k2.dq.z*dt*0.5},
        add(s.w, scale(k2.dw, dt*0.5)),
        s.m + k2.dm * dt * 0.5
    };
    s3.q = normalize(s3.q);
    Derivative k3 = compute_derivative(s3, cfg, cmds, t + dt*0.5, earth_model);

    State s4 = {
        add(s.r, scale(k3.dr, dt)),
        add(s.v, scale(k3.dv, dt)),
        {s.q.w + k3.dq.w*dt, s.q.x + k3.dq.x*dt, s.q.y + k3.dq.y*dt, s.q.z + k3.dq.z*dt},
        add(s.w, scale(k3.dw, dt)),
        s.m + k3.dm * dt
    };
    s4.q = normalize(s4.q);
    Derivative k4 = compute_derivative(s4, cfg, cmds, t + dt, earth_model);

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

    return sf;
}

} // namespace

Full6DOFIntegrator::Full6DOFIntegrator(SimConfig cfg)
    : cfg_(std::move(cfg)), earth_model_(cfg_.earth_params), sensor_model_(cfg_.sensor_params)
{
    reset();
}

void Full6DOFIntegrator::reset()
{
    frame_ = SimFrame{};
    frame_.r_n = cfg_.r0_n;
    frame_.v_n = cfg_.v0_n;
    frame_.mass_kg = cfg_.mass_init_kg;
    frame_.q_b_n = cfg_.q0_b_n;
    frame_.omega_b_b = {0, 0, 0};
    frame_.t_s = 0.0;
    nav_initialized_ = false;
    gps_accum_s_ = 0.0;
    next_sep_idx_ = 0;
    boost_seen_ = false;
}

void Full6DOFIntegrator::updateTuningParams(const TuningParams& params) {
    auto [ctrl, alloc] = control::ControllerFactory::create(params);
    cfg_.controller = ctrl;
    cfg_.allocator = alloc;
}

void Full6DOFIntegrator::evaluateStaging(double current_thrust_n)
{
    frame_.separation_fired = false;
    frame_.stage_index = static_cast<int>(next_sep_idx_);

    if (current_thrust_n > 1e-6) boost_seen_ = true;

    if (next_sep_idx_ >= cfg_.stage_separations.size()) return;

    const StageSeparation& ev = cfg_.stage_separations[next_sep_idx_];

    bool triggered = false;
    switch (ev.trigger) {
        case gnc::sep::Trigger::Time:
            triggered = frame_.t_s >= ev.trigger_value;
            break;
        case gnc::sep::Trigger::Altitude:
            triggered = frame_.altitude_msl_m >= ev.trigger_value;
            break;
        case gnc::sep::Trigger::Velocity:
            triggered = frame_.speed_m_s >= ev.trigger_value;
            break;
        case gnc::sep::Trigger::Burnout:
            // Fire once the current stage has thrust and then drops to zero.
            triggered = boost_seen_ && current_thrust_n <= 1e-6;
            break;
        case gnc::sep::Trigger::Event:
            // Externally commanded (mission sequencer); never auto-fires here.
            triggered = false;
            break;
    }
    if (!triggered) return;

    // --- Mass discontinuity: drop the jettisoned mass instantaneously. -----
    double new_mass = frame_.mass_kg - ev.jettison_mass_kg;
    if (new_mass < 1e-3) new_mass = 1e-3;
    frame_.mass_kg = new_mass;

    // --- Switch the active stage's mass/inertia/aero/thrust. ----------------
    // Re-base the wet mass so the mass-fraction interpolation works for the
    // upper stage (post-jettison mass becomes the new wet mass unless given).
    cfg_.mass_init_kg = ev.next_mass_init_kg >= 0.0 ? ev.next_mass_init_kg : new_mass;
    if (ev.next_mass_dry_kg >= 0.0) cfg_.mass_dry_kg = ev.next_mass_dry_kg;
    if (cfg_.mass_dry_kg > cfg_.mass_init_kg) cfg_.mass_dry_kg = cfg_.mass_init_kg;

    if (ev.has_inertia_wet) cfg_.full.inertia_wet = ev.inertia_wet;
    if (ev.has_inertia_dry) cfg_.full.inertia_dry = ev.inertia_dry;
    if (ev.next_thrust_curve) cfg_.thrust_curve = ev.next_thrust_curve;
    if (ev.next_aero_coeffs)  cfg_.aero_coeffs  = ev.next_aero_coeffs;

    // --- Stamp the frame and advance staging state. -------------------------
    frame_.separation_fired = true;
    frame_.separation_label = ev.label;
    frame_.phase = FlightPhase::Sep1to2;
    ++next_sep_idx_;
    frame_.stage_index = static_cast<int>(next_sep_idx_);
    boost_seen_ = false; // reset burnout detection for the new stage
}

SimFrame Full6DOFIntegrator::step()
{
    State s;
    s.r = frame_.r_n;
    s.v = frame_.v_n;
    s.q = frame_.q_b_n;
    s.w = frame_.omega_b_b;
    s.m = frame_.mass_kg;

    double q_dyn = 0.0;
    gnc::control::ActuatorCommands act_cmds;
    if (cfg_.controller && cfg_.allocator) {
        gnc::control::ControllerState c_state;

        // True Acceleration in body frame for IMU (using previous step's commands to avoid algebraic loop)
        Derivative d_true = compute_derivative(s, cfg_, last_cmds_, frame_.t_s, earth_model_);
        Vec3 accel_true_n = d_true.dv; // Total acceleration in NED (including gravity, aero, thrust)
        // IMU measures specific force: a_sf = a_n - g_n.
        Vec3 g_n = earth_model_.compute_gravity_ned(s.r);
        Vec3 a_sf_n = sub(accel_true_n, g_n);
        Quat q_inv = {s.q.w, -s.q.x, -s.q.y, -s.q.z};
        Vec3 a_sf_b = rotate(q_inv, a_sf_n);

        // Add sensor noise
        SensorMeasurements meas = sensor_model_.compute_measurements(s.r, s.v, s.q, s.w, a_sf_b, cfg_.dt_s);

        // ----- v8 INV-3: estimator-in-the-loop ----------------------------
        // The controller is fed from the ErrorStateKF output (noisy, estimated)
        // unless feedback_source is explicitly Truth (debug-only).
        if (cfg_.feedback_source == FeedbackSource::Estimated) {
            if (!nav_initialized_) {
                estimation::EskfParams ep;
                ep.gravity_n = earth_model_.compute_gravity_ned(cfg_.r0_n);
                // Use configured sensor noise; fall back to defaults if unset
                // (0 std would make the measurement covariance singular).
                if (cfg_.sensor_params.gps_pos_std > 0.0)
                    ep.gps_pos_std = cfg_.sensor_params.gps_pos_std;
                if (cfg_.sensor_params.gps_vel_std > 0.0)
                    ep.gps_vel_std = cfg_.sensor_params.gps_vel_std;
                if (cfg_.sensor_params.accel_noise_density > 0.0)
                    ep.sigma_a = cfg_.sensor_params.accel_noise_density;
                if (cfg_.sensor_params.gyro_noise_density > 0.0)
                    ep.sigma_g = cfg_.sensor_params.gyro_noise_density;
                nav_.initialize(cfg_.r0_n, cfg_.v0_n, cfg_.q0_b_n, ep);
                nav_initialized_ = true;
                gps_accum_s_ = 0.0;
            }
            nav_.predict(meas.accel_measured, meas.gyro_measured, cfg_.dt_s);
            gps_accum_s_ += cfg_.dt_s;
            if (gps_accum_s_ >= (1.0 / cfg_.gps_update_hz)) {
                nav_.update_gps(meas.gps_pos_ned, meas.gps_vel_ned);
                gps_accum_s_ = 0.0;
            }
            const auto nav_st = nav_.state();
            c_state.position_n = nav_st.pos_n;
            c_state.velocity_n = nav_st.vel_n;
            // Euler from estimated quaternion (same ZYX convention used below).
            const Quat& qe = nav_st.q_b_n;
            double sinp = 2.0 * (qe.w * qe.y - qe.z * qe.x);
            if (std::abs(sinp) >= 1.0)
                c_state.euler_angles_rad.y = std::copysign(gnc::PI * 0.5, sinp);
            else
                c_state.euler_angles_rad.y = std::asin(sinp);
            double sqy = qe.y * qe.y, sqz = qe.z * qe.z, sqx = qe.x * qe.x;
            c_state.euler_angles_rad.z = std::atan2(2.0 * (qe.w * qe.z + qe.x * qe.y),
                                                    1.0 - 2.0 * (sqy + sqz));
            c_state.euler_angles_rad.x = std::atan2(2.0 * (qe.w * qe.x + qe.y * qe.z),
                                                    1.0 - 2.0 * (sqx + sqy));
            // Rate from gyro corrected by estimated bias.
            c_state.angular_velocity_rad_s = {
                meas.gyro_measured.x - nav_st.bias_g_b.x,
                meas.gyro_measured.y - nav_st.bias_g_b.y,
                meas.gyro_measured.z - nav_st.bias_g_b.z};
        } else {
            // FeedbackSource::Truth — DEBUG ONLY (v8 INV-3: produces non-representative results)
            c_state.position_n = meas.gps_pos_ned;
            c_state.velocity_n = meas.gps_vel_ned;
            c_state.angular_velocity_rad_s = meas.gyro_measured;
            c_state.euler_angles_rad.x = frame_.roll_deg * gnc::DEG2RAD;
            c_state.euler_angles_rad.y = frame_.pitch_deg * gnc::DEG2RAD;
            c_state.euler_angles_rad.z = frame_.yaw_deg * gnc::DEG2RAD;
        }
        c_state.mass_kg = s.m;

        // Approximations for dynamic pressure and thrust for the allocator
        double alt = -s.r.z;
        double rho = 1.225 * std::exp(-alt / 8500.0); // simple exponential for density fallback
        double v_rel = norm(s.v); // roughly
        c_state.q_dyn = 0.5 * rho * v_rel * v_rel;
        q_dyn = c_state.q_dyn;
        
        gnc::control::ControllerState target;
        // Example logic: try to hold pitch at 90 deg (vertical)
        target.euler_angles_rad = {0.0, 90.0 * gnc::DEG2RAD, 0.0};

        auto effort = cfg_.controller->calculate_control(c_state, target, cfg_.dt_s);
        
        gnc::control::AllocatorState a_state;
        a_state.q_dyn = c_state.q_dyn;
        a_state.thrust_n = 0.0; // Needs thrust estimate, let's keep it 0 for aero fins
        // Use motor_on_curve when motor is burning, motor_off_curve when motor is off
        if (cfg_.motor_on_curve && cfg_.motor_on_curve->isLoaded() && cfg_.motor_off_curve && cfg_.motor_off_curve->isLoaded()) {
            auto motor_on_data = cfg_.motor_on_curve->lookup(frame_.t_s);
            if (motor_on_data.thrust_N > 1e-6) {
                a_state.thrust_n = motor_on_data.thrust_N;
            } else {
                a_state.thrust_n = cfg_.motor_off_curve->lookup(frame_.t_s).thrust_N;
            }
        } else if (cfg_.thrust_curve && cfg_.thrust_curve->isLoaded()) {
             a_state.thrust_n = cfg_.thrust_curve->lookup(frame_.t_s).thrust_N;
        } else if (frame_.t_s <= cfg_.burn_time_s) {
             a_state.thrust_n = cfg_.thrust_N;
        }
        a_state.S_ref = cfg_.full.S_ref_m2 > 0 ? cfg_.full.S_ref_m2 : cfg_.cd_A_m2;
        a_state.L_ref = cfg_.full.L_ref_m > 0 ? cfg_.full.L_ref_m : 1.0;
        
        act_cmds = cfg_.allocator->allocate(effort, a_state);
    } else {
        act_cmds = last_cmds_;
    }

    // Apply Actuator Dynamics
    double dt = cfg_.dt_s;
    const double ACTUATOR_RATE_LIMIT_RAD_S = cfg_.fin_rate_max_deg_s * gnc::DEG2RAD;
    const double ACTUATOR_POS_LIMIT_RAD = cfg_.fin_delta_max_deg * gnc::DEG2RAD;
    
    auto step_actuator = [&](double commanded, double& actual) {
        commanded = std::clamp(commanded, -ACTUATOR_POS_LIMIT_RAD, ACTUATOR_POS_LIMIT_RAD);
        double err = commanded - actual;
        double step = std::clamp(err, -ACTUATOR_RATE_LIMIT_RAD_S * dt, ACTUATOR_RATE_LIMIT_RAD_S * dt);
        actual += step;
        return actual;
    };

    double max_fin_cmd = 1e-6;
    double max_fin_act = 1e-6;
    const int n_active_fins = std::clamp(act_cmds.n_fins, 0, gnc::control::kMaxFins);
    for(int i=0; i<n_active_fins; ++i) {
        double c = std::abs(act_cmds.fins_rad[i]);
        max_fin_cmd = std::max(max_fin_cmd, c);
        act_cmds.fins_rad[i] = step_actuator(act_cmds.fins_rad[i], fin_angles_rad_[i]);
        max_fin_act = std::max(max_fin_act, std::abs(act_cmds.fins_rad[i]));
    }
    
    double tvc_cmd_max = std::max(std::abs(act_cmds.tvc_pitch_rad), std::abs(act_cmds.tvc_yaw_rad));
    double tvc_act_max = 1e-6;
    act_cmds.tvc_pitch_rad = step_actuator(act_cmds.tvc_pitch_rad, tvc_pitch_angle_rad_);
    tvc_act_max = std::max(tvc_act_max, std::abs(act_cmds.tvc_pitch_rad));
    act_cmds.tvc_yaw_rad = step_actuator(act_cmds.tvc_yaw_rad, tvc_yaw_angle_rad_);
    tvc_act_max = std::max(tvc_act_max, std::abs(act_cmds.tvc_yaw_rad));

    // Scale allocated moments by the proportion of actual vs commanded deflection
    double fin_scale = max_fin_cmd > 1e-6 ? std::min(1.0, max_fin_act / max_fin_cmd) : 1.0;
    double tvc_scale = tvc_cmd_max > 1e-6 ? std::min(1.0, tvc_act_max / tvc_cmd_max) : 1.0;
    
    act_cmds.allocated_aero_moment.x *= fin_scale;
    act_cmds.allocated_aero_moment.y *= fin_scale;
    act_cmds.allocated_aero_moment.z *= fin_scale;
    act_cmds.allocated_thrust_moment.x *= tvc_scale;
    act_cmds.allocated_thrust_moment.y *= tvc_scale;
    act_cmds.allocated_thrust_moment.z *= tvc_scale;

    last_cmds_ = act_cmds;

    State sf = rk4_step(s, cfg_, act_cmds, frame_.t_s, cfg_.dt_s, earth_model_);

    frame_.t_s += cfg_.dt_s;
    frame_.r_n = sf.r;
    frame_.v_n = sf.v;
    frame_.q_b_n = sf.q;
    frame_.omega_b_b = sf.w;
    frame_.mass_kg = sf.m;
    frame_.altitude_msl_m = -sf.r.z;
    frame_.speed_m_s = norm(sf.v);

    // Compute ECEF position and Geodetic LLA
    frame_.r_ecef = earth_model_.ned_to_ecef(sf.r);
    GeodeticLLA lla = earth_model_.ecef_to_lla(frame_.r_ecef);
    frame_.lat_deg = lla.lat_rad * gnc::RAD2DEG;
    frame_.lon_deg = lla.lon_rad * gnc::RAD2DEG;

    ThrustData td = cfg_.thrust_curve ? cfg_.thrust_curve->lookup(frame_.t_s) : ThrustData{};
    const bool boosting = td.thrust_N > 1e-6 && sf.m > cfg_.mass_dry_kg;
    if (boosting) {
        frame_.phase = (frame_.stage_index >= 1) ? FlightPhase::BoostS2
                                                  : FlightPhase::BoostS1;
    } else {
        if (sf.v.z > 0.0) {
            frame_.phase = FlightPhase::Terminal;
        } else {
            frame_.phase = (frame_.stage_index >= 1) ? FlightPhase::CoastS2
                                                      : FlightPhase::CoastS1;
        }
    }

    // v8 P3.3 — evaluate staging after the state/phase update. May jettison mass,
    // switch the active stage, and override the phase to Sep1to2 on the fire step.
    evaluateStaging(td.thrust_N);

    // Euler angles from quat for telemetry
    // Assuming NED -> Body ZYX or similar.
    double sqw = sf.q.w*sf.q.w;
    double sqx = sf.q.x*sf.q.x;
    double sqy = sf.q.y*sf.q.y;
    double sqz = sf.q.z*sf.q.z;
    // Gimbal Lock and Domain Safeguards for asin
    double sinp = 2.0 * (sf.q.w * sf.q.y - sf.q.z * sf.q.x);
    if (std::abs(sinp) >= 1.0) {
        frame_.pitch_deg = std::copysign(90.0, sinp); // Use +/- 90 degrees if out of bounds
    } else {
        frame_.pitch_deg = std::asin(sinp) * gnc::RAD2DEG;
    }
    frame_.yaw_deg = std::atan2(2.0 * (sf.q.w*sf.q.z + sf.q.x*sf.q.y), 1.0 - 2.0*(sqy + sqz)) * gnc::RAD2DEG;
    frame_.roll_deg = std::atan2(2.0 * (sf.q.w*sf.q.x + sf.q.y*sf.q.z), 1.0 - 2.0*(sqx + sqy)) * gnc::RAD2DEG;

    if (frame_.altitude_msl_m <= cfg_.ground_alt_m && frame_.v_n.z > 0 && frame_.t_s > 1.0) {
        frame_.finished = true;
    }
    if (frame_.t_s >= cfg_.t_end_s) {
        frame_.finished = true;
    }

    // Populate the 103-variable data logger snapshot
    frame_.log_row.time_s = frame_.t_s;
    frame_.log_row.velocity_x_m_s = sf.v.x;
    frame_.log_row.velocity_y_m_s = sf.v.y;
    frame_.log_row.velocity_z_m_s = sf.v.z;
    frame_.log_row.velocity_total_m_s = frame_.speed_m_s;
    frame_.log_row.position_x_m = sf.r.x;
    frame_.log_row.position_y_m = sf.r.y;
    frame_.log_row.position_z_m = sf.r.z;
    frame_.log_row.altitude_m = frame_.altitude_msl_m;
    frame_.log_row.ground_range_m = std::sqrt(sf.r.x*sf.r.x + sf.r.y*sf.r.y);
    
    // Calculate Telemetry variables at current state
    double alt = -s.r.z;
    AtmosphereData atmo = {alt, 101325.0, 288.15, 1.225, 340.29, 0,0,0};
    if (cfg_.atmosphere_table) atmo = cfg_.atmosphere_table->lookup(alt);

    Vec3 wind_n = {atmo.wind_north_m_s, atmo.wind_east_m_s, atmo.wind_down_m_s};
    Vec3 v_rel_n = {sf.v.x - wind_n.x, sf.v.y - wind_n.y, sf.v.z - wind_n.z};
    Quat q_inv_for_log = {sf.q.w, -sf.q.x, -sf.q.y, -sf.q.z};
    
    // manual rotate for logging
    Quat qv_rel{0, v_rel_n.x, v_rel_n.y, v_rel_n.z};
    Quat r_rel = {
        sf.q.w*qv_rel.w - sf.q.x*qv_rel.x - sf.q.y*qv_rel.y - sf.q.z*qv_rel.z,
        sf.q.w*qv_rel.x + sf.q.x*qv_rel.w + sf.q.y*qv_rel.z - sf.q.z*qv_rel.y,
        sf.q.w*qv_rel.y - sf.q.x*qv_rel.z + sf.q.y*qv_rel.w + sf.q.z*qv_rel.x,
        sf.q.w*qv_rel.z + sf.q.x*qv_rel.y - sf.q.y*qv_rel.x + sf.q.z*qv_rel.w
    };
    Quat v_rel_b_q = {
        r_rel.w*q_inv_for_log.w - r_rel.x*q_inv_for_log.x - r_rel.y*q_inv_for_log.y - r_rel.z*q_inv_for_log.z,
        r_rel.w*q_inv_for_log.x + r_rel.x*q_inv_for_log.w + r_rel.y*q_inv_for_log.z - r_rel.z*q_inv_for_log.y,
        r_rel.w*q_inv_for_log.y - r_rel.x*q_inv_for_log.z + r_rel.y*q_inv_for_log.w + r_rel.z*q_inv_for_log.x,
        r_rel.w*q_inv_for_log.z + r_rel.x*q_inv_for_log.y - r_rel.y*q_inv_for_log.x + r_rel.z*q_inv_for_log.w
    };
    Vec3 v_rel_b = {v_rel_b_q.x, v_rel_b_q.y, v_rel_b_q.z};
    
    double v_rel_norm = std::sqrt(v_rel_b.x*v_rel_b.x + v_rel_b.y*v_rel_b.y + v_rel_b.z*v_rel_b.z);
    double mach = v_rel_norm / (atmo.speed_of_sound_m_s > 0 ? atmo.speed_of_sound_m_s : 340.29);
    
    double V_axial = -v_rel_b.z;
    double V_normal = std::sqrt(v_rel_b.x*v_rel_b.x + v_rel_b.y*v_rel_b.y);
    double alpha_rad = 0.0;
    double beta_rad = 0.0;
    if (v_rel_norm > 1e-3) {
        alpha_rad = std::atan2(V_normal, V_axial);
        beta_rad = std::asin(v_rel_b.y / v_rel_norm);
    }
    
    ThrustData thrust_data{frame_.t_s, 0.0, 0.0};
    // Use motor_on_curve when motor is burning, motor_off_curve when motor is off
    if (cfg_.motor_on_curve && cfg_.motor_on_curve->isLoaded() && cfg_.motor_off_curve && cfg_.motor_off_curve->isLoaded()) {
        auto motor_on_data = cfg_.motor_on_curve->lookup(frame_.t_s);
        if (motor_on_data.thrust_N > 1e-6) {
            thrust_data = motor_on_data;
        } else {
            thrust_data = cfg_.motor_off_curve->lookup(frame_.t_s);
        }
    } else if (cfg_.thrust_curve && cfg_.thrust_curve->isLoaded()) {
        thrust_data = cfg_.thrust_curve->lookup(frame_.t_s);
    } else if (frame_.t_s <= cfg_.burn_time_s) {
        thrust_data = {frame_.t_s, cfg_.thrust_N, (cfg_.mass_init_kg - cfg_.mass_dry_kg) / cfg_.burn_time_s};
    }
    if (sf.m <= cfg_.mass_dry_kg) thrust_data.thrust_N = 0.0;

    double q_dyn_actual = 0.5 * atmo.density_kg_m3 * v_rel_norm * v_rel_norm;
    AeroData aero{mach, alpha_rad * gnc::RAD2DEG, 0.4, 0.0, 0.0};
    std::shared_ptr<AeroCoeffs> active_aero = cfg_.aero_coeffs;
    if (thrust_data.thrust_N > 1e-6) {
        if (cfg_.aero_coeffs_motor_on && cfg_.aero_coeffs_motor_on->isLoaded()) {
            active_aero = cfg_.aero_coeffs_motor_on;
        }
    } else {
        if (cfg_.aero_coeffs_motor_off && cfg_.aero_coeffs_motor_off->isLoaded()) {
            active_aero = cfg_.aero_coeffs_motor_off;
        }
    }
    if (active_aero && active_aero->isLoaded()) {
        aero = active_aero->lookup(mach, aero.alpha_deg);
    }
    double S_ref = cfg_.full.S_ref_m2 > 0 ? cfg_.full.S_ref_m2 : cfg_.cd_A_m2;
    Vec3 F_aero_b{0,0,0};
    if (v_rel_norm > 1e-3) {
        F_aero_b.x = -(v_rel_b.x / v_rel_norm) * q_dyn_actual * S_ref * aero.Cd;
        F_aero_b.y = -(v_rel_b.y / v_rel_norm) * q_dyn_actual * S_ref * aero.Cd;
        F_aero_b.z = -(v_rel_b.z / v_rel_norm) * q_dyn_actual * S_ref * aero.Cd;
    }

    frame_.log_row.alpha_rad = alpha_rad;
    frame_.log_row.alpha_deg = alpha_rad * gnc::RAD2DEG;
    frame_.log_row.beta_rad = beta_rad;
    frame_.log_row.beta_deg = beta_rad * gnc::RAD2DEG;
    
    frame_.log_row.mach = mach; 
    frame_.log_row.mach_aero = mach;
    frame_.log_row.q_dynamic_Pa = q_dyn_actual;
    frame_.log_row.q_gain_pilot_kPa = q_dyn_actual / 1000.0;
    frame_.log_row.airspeed_m_s = v_rel_norm;

    frame_.log_row.quat_w = sf.q.w;
    frame_.log_row.quat_x = sf.q.x;
    frame_.log_row.quat_y = sf.q.y;
    frame_.log_row.quat_z = sf.q.z;
    frame_.log_row.roll_deg = frame_.roll_deg;
    frame_.log_row.pitch_deg = frame_.pitch_deg;
    frame_.log_row.yaw_deg = frame_.yaw_deg;
    
    frame_.log_row.omega_x_rad_s = sf.w.x;
    frame_.log_row.omega_y_rad_s = sf.w.y;
    frame_.log_row.omega_z_rad_s = sf.w.z;
    frame_.log_row.omega_x_deg_s = sf.w.x * gnc::RAD2DEG;
    frame_.log_row.omega_y_deg_s = sf.w.y * gnc::RAD2DEG;
    frame_.log_row.omega_z_deg_s = sf.w.z * gnc::RAD2DEG;
    
    frame_.log_row.thrust_x_N = 0.0;
    frame_.log_row.thrust_y_N = 0.0;
    frame_.log_row.thrust_z_N = -thrust_data.thrust_N;
    
    frame_.log_row.force_x_N = F_aero_b.x + frame_.log_row.thrust_x_N;
    frame_.log_row.force_y_N = F_aero_b.y + frame_.log_row.thrust_y_N;
    frame_.log_row.force_z_N = F_aero_b.z + frame_.log_row.thrust_z_N;

    frame_.log_row.CN_base = aero.Cn;
    frame_.log_row.CM_base = aero.Cm;
    frame_.log_row.CY_base = 0.0;
    frame_.log_row.Cn_base = 0.0;

    // Guidance stubs
    frame_.log_row.guidance_mode = 0.0;
    frame_.log_row.autopilot_mode = 0.0;
    frame_.log_row.flight_phase = static_cast<double>(frame_.phase);

    // Actuators (log only the active surfaces)
    frame_.actuator_positions = std::vector<double>(
        act_cmds.fins_rad.begin(),
        act_cmds.fins_rad.begin() + std::clamp(act_cmds.n_fins, 0, gnc::control::kMaxFins));
    if (act_cmds.n_fins >= 4) {
        frame_.log_row.fin1_deflection_rad = act_cmds.fins_rad[0];
        frame_.log_row.fin2_deflection_rad = act_cmds.fins_rad[1];
        frame_.log_row.fin3_deflection_rad = act_cmds.fins_rad[2];
        frame_.log_row.fin4_deflection_rad = act_cmds.fins_rad[3];
        frame_.log_row.fin1_deflection_deg = act_cmds.fins_rad[0] * gnc::RAD2DEG;
        frame_.log_row.fin2_deflection_deg = act_cmds.fins_rad[1] * gnc::RAD2DEG;
        frame_.log_row.fin3_deflection_deg = act_cmds.fins_rad[2] * gnc::RAD2DEG;
        frame_.log_row.fin4_deflection_deg = act_cmds.fins_rad[3] * gnc::RAD2DEG;
    }

    frame_.log_row.mass_kg = sf.m;
    frame_.log_row.lat_deg = frame_.lat_deg;
    frame_.log_row.lon_deg = frame_.lon_deg;
    frame_.log_row.alt_msl_m = frame_.altitude_msl_m;

    return frame_;
}

}  // namespace gnc::sim
