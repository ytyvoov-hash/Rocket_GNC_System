// AUTO-GENERATED FROM schemas/*.schema.yaml. DO NOT EDIT BY HAND.
// Run `npm run gen:types` from gnc-frontend/ to regenerate.
//
// Source: schemas/*.schema.yaml  (single source of truth, see plan §10 Rec 5)
// Generator: gnc-frontend/scripts/generate_types.mjs


// ----------------- actuator_library.schema.yaml -----------------
// ActuatorLibrary
export type Schema_ActuatorLibrary_CommonFields = {
        description?: string;
        model_type: string;
        rate_max_deg_s: number;
        delta_max_deg: number;
        delta_min_deg: number;
        deadband_deg?: number;
        backlash_deg?: number;
        config_type?: "X" | "plus" | "V" | "custom";
        datasheet_url?: string;
        manufacturer?: string;
        part_number?: string;
    };

export type Schema_ActuatorLibrary_SecondOrderWithDelay = Schema_ActuatorLibrary_CommonFields & {
        model_type?: "second_order_with_delay";
        wn_rad_s: number;
        zeta: number;
        delay_s: number;
    };

export type Schema_ActuatorLibrary_FirstOrder = Schema_ActuatorLibrary_CommonFields & {
        model_type?: "first_order";
        tau_s: number;
    };

export type Schema_ActuatorLibrary_Ideal = Schema_ActuatorLibrary_CommonFields & {
        model_type?: "ideal";
    };

export type Schema_ActuatorLibrary_Electromechanical = Schema_ActuatorLibrary_CommonFields & {
        model_type?: "electromechanical";
        motor: {
            kt_Nm_per_A: number;
            ke_Vs_per_rad: number;
            R_ohm: number;
            L_H: number;
            J_motor_kgm2: number;
        };
        gearbox: {
            ratio: number;
            efficiency: number;
        };
        hinge_moment_curve_csv?: string;
    };

export type Schema_ActuatorLibrary = {
        schema_version?: string;
        actuators: Record<string, Schema_ActuatorLibrary_SecondOrderWithDelay | Schema_ActuatorLibrary_FirstOrder | Schema_ActuatorLibrary_Ideal | Schema_ActuatorLibrary_Electromechanical>;
    };

// ----------------- android_usb_roles.schema.yaml -----------------
export type Schema_AndroidUsbRoles = unknown;

// ----------------- controller_library.schema.yaml -----------------
// ControllerLibrary
export type Schema_ControllerLibrary_ControllerEntry = {
        description?: string;
        algorithm: "pid" | "lqr" | "lqg" | "h_infinity" | "sliding_mode" | "backstepping" | "mpc_linear" | "mpc_nonlinear" | "mrac" | "l1_adaptive";
        gains: Record<string, unknown>;
        gain_schedule?: {
            interpolation?: "linear" | "cubic" | "linear_with_cubic_boundaries";
            axes?: Array<string>;
            operating_points?: Array<{
                coordinates: Array<number>;
                gains: Record<string, unknown>;
            }>;
        };
        anti_windup?: {
            method?: "integrator_freeze" | "back_calculation" | "clamping" | "none";
            back_calc_gain?: number;
        };
        saturation_strategy?: "uniform_reduction" | "redistribute" | "demand_reduction_upstream";
        sampling_rate_hz?: number;
    };

export type Schema_ControllerLibrary = {
        schema_version?: string;
        controllers: Record<string, Schema_ControllerLibrary_ControllerEntry>;
    };

// ----------------- flight_log_103_columns.schema.yaml -----------------
export type Schema_FlightLog103Columns = unknown;

// ----------------- hardware_mapping.schema.yaml -----------------
// HardwareMapping
export type Schema_HardwareMapping = {
        schema_version?: string;
        flight_computer_variant?: "STM32H743" | "STM32H753";
        servo_protocol?: "canopen" | "rudder_7b";
        bus: {
            type: "classic_can" | "fdcan";
            bitrate_bps: number;
            bridge?: {
                type?: "ch340" | "slcan" | "gs_usb" | "candle" | "kvaser" | "peak";
                vid?: string;
                pid?: string;
            };
            utilisation_budget_pct?: number;
        };
        servos: Array<{
            stage_index: number;
            fin_index: number;
            node_id: string;
            actuator_ref?: string;
            installed?: boolean;
        }>;
        pyros: Array<{
            event_name: string;
            node_id: string;
            arming_pin?: string;
            description?: string;
        }>;
        gpios?: Array<{
            name: string;
            pin: string;
            direction?: "in" | "out" | "alternate";
            active_level?: "high" | "low";
        }>;
        uart_ports?: Array<{
            name: string;
            role: "GPS" | "EXT_IMU" | "TELEMETRY_RADIO" | "SEEKER_LINK" | "DEBUG";
            baud?: number;
        }>;
        ethernet?: {
            enabled?: boolean;
            tcp_5900_role?: "server" | "client" | "disabled";
        };
        seeker?: {
            host?: "snapdragon" | "jetson_nano" | "none";
            link?: "uart" | "can" | "none";
            camera?: {
                interface?: "usb" | "csi" | "ethernet";
                intrinsics?: {
                    fx: number;
                    fy: number;
                    cx: number;
                    cy: number;
                    distortion?: Array<number>;
                };
            };
        };
    };

// ----------------- mission_file.schema.yaml -----------------
// MissionFile
export type Schema_MissionFile_PerStageMission = {
        stage_id: string;
        autopilot_mode: "auto_shape" | "fixed_pitch" | "passive_ballistic" | "waypoint" | "terminal_homing";
        autopilot_params?: Record<string, unknown>;
        abort_policy?: {
            alpha_max_deg?: number;
            rate_max_deg_s?: number;
            estimator_divergence?: number;
            link_loss_timeout_s?: number;
            recurring_saturation?: {
                enabled?: boolean;
                mode?: "cruise_percent" | "continuous_block" | "both";
                cruise_percent_threshold?: number;
                continuous_block_ms?: number;
            };
        };
    };

export type Schema_MissionFile = {
        mission_id: string;
        rocket_id: string;
        flight_computer_path: "A" | "B";
        loop_rate_hz: number;
        locked?: boolean;
        target_ground_range_m?: number;
        cep_target_m?: number;
        guidance_reference_pitch_deg?: number;
        stages: Array<Schema_MissionFile_PerStageMission>;
        estimator: {
            approach: "single_filter" | "sequential" | "imm";
        };
        mhe?: {
            enabled?: boolean;
            horizon?: number;
            rate_hz?: number;
            budget_overrun_mode?: "skip" | "reduce_horizon" | "reduce_trust";
        };
        seeker?: {
            enabled?: boolean;
            mode?: "strapdown" | "gimbaled";
            target_class?: string;
            loss_of_lock_policy?: "revert_trajectory" | "continue_PN" | "abort" | "operator_prompt";
            camera_id?: string;
            fov_deg?: Array<number>;
            mount_isolation?: "rigid" | "rubber" | "gel" | "gimbal_2axis";
            los_rate_method?: "savitzky_golay" | "first_order" | "state_observer";
            pn_variant?: "pure" | true | "augmented";
            pn_gain_N?: number;
            inference_target?: "gpu" | "cpu" | "hexagon";
        };
        optional_devices: {
            gps: {
                present: boolean;
                sensor_id?: string;
                fix_quality_required?: "RTK_OR_SBAS" | "RTK" | "SBAS" | "GPS" | "ANY";
                latency_ms?: number;
            };
            radio: {
                present: boolean;
                band?: string;
                tx_power_dbm?: number;
            };
            warhead_fuse?: boolean;
            engine_starter_1?: boolean;
            engine_starter_2?: boolean;
            separating_nail_1?: boolean;
            separating_nail_2?: boolean;
            jamble?: boolean;
            external_imu?: {
                present?: boolean;
            };
            flight_termination_system?: {
                present?: boolean;
            };
        };
        logging_profile?: "FULL" | "FLIGHT" | "MINIMAL";
        logging_completeness_target?: number;
        safety_zone: {
            type: "polygon" | "circle" | "vlos_or_tethered";
            vertices?: Array<Array<number>>;
            center?: Array<number>;
            radius_m?: number;
            abort_on_breach: boolean;
        };
        validation?: {
            status?: "not_run" | "valid" | "invalid";
            errors?: Array<string>;
        };
        locked_at?: string;
        locked_actuator_library_sha256?: string;
        locked_controller_library_sha256?: string;
    };

// ----------------- rocket_template.schema.yaml -----------------
// RocketTemplate
export type Schema_RocketTemplate_Stage = {
        stage_id: string;
        stage_index: number;
        name?: string;
        is_terminal: boolean;
        has_warhead?: boolean;
        seeker_capable?: boolean;
        physical: {
            mass_dry_kg: number;
            propellant_mass_kg: number;
            insulation_mass_kg?: number;
            cg_dry_body_m: Array<number>;
            cg_full_body_m?: Array<number>;
            cg_propellant_body_m?: Array<number>;
            inertia_dry_kgm2: Array<number>;
            inertia_full_kgm2: Array<number>;
        };
        geometry: {
            ref_diameter_m: number;
            ref_length_m: number;
            ref_area_m2: number;
            moment_reference_point_m?: number;
        };
        aerodynamics?: {
            coefficient_files?: {
                CN?: string;
                CM?: string;
                CA_on?: string;
                CA_off?: string;
                damping?: string;
                fin_loads?: string;
                roll?: string;
            };
        };
        propulsion?: {
            thrust_curve_file?: string;
            burn_time_s?: number;
            total_impulse_Ns?: number;
            isp_s?: number;
            thrust_multiplier?: number;
            nozzle_exit_area_m2?: number;
            sea_level_pressure_Pa?: number;
        };
        controller_type: "fins" | "tvc" | "hybrid" | "cold_gas" | "aerospike" | "roll_canards" | "none";
        controller_ref?: string;
        autopilot?: {
            enabled?: boolean;
            capable_modes?: Array<"auto_shape" | "fixed_pitch" | "passive_ballistic" | "waypoint" | "terminal_homing">;
            params?: Record<string, unknown>;
        };
        fin_config?: {
            sets?: Array<{
                set_index: number;
                fin_count: number;
                S_fin_m2: number;
                c_fin_m: number;
                x_fin_m: number;
                delta_max_deg: number;
                delta_dot_max_deg_s: number;
                actuator_ref?: string;
                per_fin_actuator_ref?: Array<string>;
                config_type?: "X" | "plus" | "V" | "custom";
            }>;
        };
        tvc_config?: {
            deflection_max_deg?: number;
            rate_max_deg_s?: number;
            actuator_ref?: string;
        };
        separation?: {
            trigger: "burnout" | "time" | "altitude" | "velocity" | "event";
            offset_s: number;
            timeout_s: number;
            arming_s: number;
            nail_count: number;
            nail_pyro_events: Array<string>;
        };
        optional_sensors?: {
            external_imu?: boolean;
            gps?: boolean;
        };
        abort_policy?: {
            alpha_max_deg?: number;
            rate_max_deg_s?: number;
            estimator_divergence?: number;
            link_loss_timeout_s?: number;
        };
    };

export type Schema_RocketTemplate = {
        template_id: string;
        display_name?: string;
        description?: string;
        type?: "sounding" | "suborbital" | "missile" | "demonstrator" | "other";
        status?: "flight-ready" | "draft" | "archived";
        num_stages: number;
        CA_multiplier?: number;
        thrust_multiplier?: number;
        hardware_mapping_file: string;
        estimation?: {
            approach?: "single_filter" | "sequential" | "imm";
            eskf?: {
                Q?: Array<unknown>;
                R?: Array<unknown>;
            };
            mhe?: {
                enabled?: boolean;
                horizon?: number;
                rate_hz?: number;
                Q?: Array<unknown>;
                R?: Array<unknown>;
            };
        };
        stages: Array<Schema_RocketTemplate_Stage>;
        launcher?: {
            enabled?: boolean;
            rail_length?: number;
            rail_effective_length?: number;
            rail_friction_coefficient?: number;
            launch_elevation?: number;
        };
    };
