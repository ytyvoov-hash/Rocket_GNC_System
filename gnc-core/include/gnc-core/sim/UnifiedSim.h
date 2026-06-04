// gnc-core/sim/UnifiedSim.h
// Unified Physics Engine supporting 3DOF, Tuning, and Full 6DOF modes.
// Replaces the legacy PointMassSim.

#pragma once

#include "../types.h"

#include <cstdint>
#include <string>
#include <memory>
#include <vector>

#include "Tables.h"
#include "EarthModel.h"
#include "SensorModel.h"
#include "gnc-core/control/IController.h"
#include "gnc-core/control/IControlAllocator.h"
#include "gnc-core/logging/DataLogger.h"
#include "gnc-core/sep/SeparationTrigger.h"

namespace gnc::sim {

// ---------------------------------------------------------------------------
// v8 P3.3 — staging / separation.
//
// A StageSeparation is a single jettison event: a trigger condition plus the
// mass dropped and the (optional) post-separation vehicle reconfiguration. The
// Full6DOF integrator evaluates events in order; when one fires it removes the
// jettisoned mass instantaneously and switches the active mass/inertia/aero/
// thrust to the upper stage. Fields left at their "keep" sentinels (<0,
// nullptr, has_* == false) preserve the current value.
//
// Upper-stage thrust curves are looked up in *absolute mission time*, i.e. the
// curve should include its pre-ignition zero-thrust segment.
// ---------------------------------------------------------------------------
struct StageSeparation {
    gnc::sep::Trigger trigger{gnc::sep::Trigger::Burnout};
    double trigger_value{0.0};   // Time: s | Altitude: m MSL | Velocity: m/s
    double jettison_mass_kg{0.0};
    std::string label{"separation"};

    // Optional post-separation reconfiguration ("keep current" by default).
    double next_mass_init_kg{-1.0};   // new wet mass (defaults to post-jettison mass)
    double next_mass_dry_kg{-1.0};
    bool   has_inertia_wet{false};
    Matrix3x3 inertia_wet{};
    bool   has_inertia_dry{false};
    Matrix3x3 inertia_dry{};
    std::shared_ptr<ThrustCurve> next_thrust_curve;
    std::shared_ptr<AeroCoeffs>  next_aero_coeffs;
};

enum class Mode {
    ThreeDOF,
    Tuning,
    Full
};

// v8 INV-3: SIL must close the loop on *estimated* state produced by the
// navigation filter from noisy IMU + GPS. Feeding the controller ground-truth
// (or undelayed raw measurements as the legacy loop did) makes every SIL run
// non-representative. Estimated is the only mode permitted to produce a SIL
// "pass"; Truth exists for debugging/bring-up only.
enum class FeedbackSource {
    Estimated,  // controller consumes ErrorStateKF output (default)
    Truth       // DEBUG ONLY — controller consumes ground-truth state
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
struct SimConfig {
    Mode sim_mode{Mode::ThreeDOF};

    // Initial state (NED, metres / m·s⁻¹).
    Vec3 r0_n{0.0, 0.0, 0.0};
    Vec3 v0_n{0.0, 0.0, 0.0};
    Quat q0_b_n{0.70710678, 0.0, -0.70710678, 0.0}; // Pitch -90 deg

    // Thrust geometry (3DOF only, Full uses TVC or static).
    Vec3   thrust_dir_n{0.0, 0.0, -1.0};
    double thrust_N{0.0};         
    double burn_time_s{0.0};      

    // Mass
    double mass_init_kg{1.0};
    double mass_dry_kg{1.0};

    // Aerodynamics (3DOF only)
    double cd_A_m2{0.0};          
    double rho_kg_m3{1.225};      

    // Environment
    double gravity_m_s2{9.80665};
    double ground_alt_m{0.0};     
    EarthModelParams earth_params;
    SensorNoiseParams sensor_params;

    // Integrator cadence
    double dt_s{0.01};            // 100 Hz default
    double t_end_s{300.0};        // hard cutoff

    // v8 INV-3: which state the controller is fed. Defaults to the estimator.
    FeedbackSource feedback_source{FeedbackSource::Estimated};
    double gps_update_hz{10.0};   // GPS measurement cadence into the estimator

    bool use_ecef{false};         // Enable ECEF coordinate propagation and gravity/Coriolis models

    // Mode-specific configurations
    struct TuningConfig {
        TuningParams pid_gains;
        bool linearized_aero{true};
    } tuning;

    struct FullConfig {
        // Mass properties at mass_init_kg (wet)
        Matrix3x3 inertia_wet;
        Vec3 cg_wet_m{0.0, 0.0, 0.0};

        // Mass properties at mass_dry_kg (dry)
        Matrix3x3 inertia_dry;
        Vec3 cg_dry_m{0.0, 0.0, 0.0};

        // Aerodynamics reference geometry
        double S_ref_m2{0.0};
        double L_ref_m{0.0};
        Vec3 r_cp_m{0.0, 0.0, 0.0}; // Center of pressure offset from reference point
        Vec3 r_thrust_m{0.0, 0.0, 0.0}; // Thrust application point offset from reference point
    } full;

    // Loaded tables
    std::shared_ptr<AtmosphereTable> atmosphere_table;
    std::shared_ptr<ThrustCurve>     thrust_curve;
    std::shared_ptr<ThrustCurve>     motor_on_curve;
    std::shared_ptr<ThrustCurve>     motor_off_curve;
    std::shared_ptr<AeroCoeffs>      aero_coeffs;
    std::shared_ptr<AeroCoeffs>      aero_coeffs_motor_on;
    std::shared_ptr<AeroCoeffs>      aero_coeffs_motor_off;
    std::shared_ptr<DampingCoeffs>       damping_coeffs;
    std::shared_ptr<FinDeflectionCoeffs> fin_deflection_coeffs;
    std::shared_ptr<RollAeroCoeffs>      roll_aero_coeffs;

    // Control Architecture
    std::shared_ptr<gnc::control::IController> controller;
    std::shared_ptr<gnc::control::IControlAllocator> allocator;

    // Actuator Limits (from rocket_properties.yaml)
    double fin_delta_max_deg{20.0};      // Max fin deflection (deg)
    double fin_rate_max_deg_s{300.0};     // Max fin rate (deg/s)

    // v8 P3.2 — delta-dependent aero. When true AND a fin_deflection_coeffs
    // deck is loaded, the realised pitch/yaw control moment (and roll, when a
    // roll_aero_coeffs deck is loaded) is sourced from the delta-swept aero
    // data at the *commanded* equivalent deflection, instead of the allocator's
    // own linear effectiveness estimate (cmds.allocated_aero_moment). Defaults
    // OFF: the only committed deck (BA rocket_data_example) is synthetic and
    // its effectiveness has not been validated against a golden trajectory
    // (P4.1), so it is opt-in until calibrated.
    bool delta_aero_from_table{false};

    // v8 P3.3 — ordered list of staging/separation events. Empty = single-stage
    // (no separation), preserving legacy behaviour.
    std::vector<StageSeparation> stage_separations;
};

// ---------------------------------------------------------------------------
// Per-step output frame (Unified format covering all modes)
// ---------------------------------------------------------------------------
struct SimFrame {
    // Common to all modes
    double      t_s{0.0};
    Vec3        r_n{};
    Vec3        v_n{};
    double      mass_kg{0.0};
    double      thrust_n{0.0};    
    double      drag_n{0.0};      
    double      altitude_msl_m{0.0};   // -r_n.z
    double      speed_m_s{0.0};   // |v|
    FlightPhase phase{FlightPhase::Prelaunch};
    bool        finished{false};

    // ECEF support
    Vec3        r_ecef{};
    double      lat_deg{0.0};
    double      lon_deg{0.0};

    // Added by Tuning / Full Modes
    double pitch_deg{0.0};
    double roll_deg{0.0};
    double yaw_deg{0.0};
    double control_output{0.0};

    // Added by Full Mode
    Quat q_b_n{};
    Vec3 omega_b_b{};
    Vec3 moments_body{};
    double alpha_deg{0.0};
    double beta_deg{0.0};
    
    // Actuators
    std::vector<double> actuator_positions;

    // v8 P3.3 — staging telemetry. stage_index is the number of separations that
    // have fired (0 = first stage). separation_fired is true only on the step a
    // separation event triggers; separation_label names that event.
    int         stage_index{0};
    bool        separation_fired{false};
    std::string separation_label;

    // Full 103-variable data logger snapshot
    logging::LogRow log_row;
};

// ---------------------------------------------------------------------------
// Base Integrator Interface
// ---------------------------------------------------------------------------
class IntegratorBase {
public:
    virtual ~IntegratorBase() = default;
    virtual SimFrame step() = 0;
    virtual const SimFrame& current() const = 0;
    virtual void reset() = 0;
    virtual void updateTuningParams(const TuningParams& params) {} // No-op by default
};

// ---------------------------------------------------------------------------
// Unified Engine
// ---------------------------------------------------------------------------
class UnifiedSim {
public:
    explicit UnifiedSim(SimConfig cfg, Mode mode);
    ~UnifiedSim();

    SimFrame step();
    
    void setMode(Mode mode);
    void updateTuningParams(const TuningParams& params);

    const SimFrame& current() const;
    bool finished() const;
    void reset();
    const SimConfig& config() const;

private:
    SimConfig cfg_;
    Mode mode_;
    std::unique_ptr<IntegratorBase> active_integrator_;

    void instantiateIntegrator();
};

}  // namespace gnc::sim
