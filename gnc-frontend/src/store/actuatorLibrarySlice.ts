import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// === Actuator Model Types ===

export type ActuatorModelType = 'second_order_with_delay' | 'first_order' | 'ideal' | 'electromechanical';

export interface SecondOrderWithDelay {
  model_type: 'second_order_with_delay';
  wn_rad_s: number;
  zeta: number;
  delay_s: number;
  rate_max_deg_s: number;
  delta_max_deg: number;
  delta_min_deg: number;
  deadband_deg: number;
  backlash_deg: number;
  config_type: 'X' | 'plus';
}

export interface FirstOrder {
  model_type: 'first_order';
  tau_s: number;
  rate_max_deg_s: number;
  delta_max_deg: number;
  delta_min_deg: number;
}

export interface Ideal {
  model_type: 'ideal';
  rate_max_deg_s: number;
  delta_max_deg: number;
  delta_min_deg: number;
}

export interface Electromechanical {
  model_type: 'electromechanical';
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
  rate_max_deg_s: number;
  delta_max_deg: number;
  delta_min_deg: number;
  hinge_moment_curve_csv?: string;
}

export type ActuatorEntry = {
  id: string;
  description: string;
} & (SecondOrderWithDelay | FirstOrder | Ideal | Electromechanical);

// === State ===

interface ActuatorLibraryState {
  entries: Record<string, ActuatorEntry>;
}

const initialState: ActuatorLibraryState = {
  entries: {
    default_4020: {
      id: 'default_4020',
      description: 'Default 4020-class servo (BA reference baseline)',
      model_type: 'second_order_with_delay',
      wn_rad_s: 2739.0,
      zeta: 0.0208,
      delay_s: 0.008,
      rate_max_deg_s: 75.0,
      delta_max_deg: 15.0,
      delta_min_deg: -15.0,
      deadband_deg: 0.0,
      backlash_deg: 0.0,
      config_type: 'X',
    },
    'XQ-4020': {
      id: 'XQ-4020',
      description: 'XQPOWER XQ-4020 (production candidate)',
      model_type: 'second_order_with_delay',
      wn_rad_s: 2618.0,
      zeta: 0.7,
      delay_s: 0.005,
      rate_max_deg_s: 428.0,
      delta_max_deg: 30.0,
      delta_min_deg: -30.0,
      deadband_deg: 0.1,
      backlash_deg: 0.2,
      config_type: 'X',
    },
    fast_first_order: {
      id: 'fast_first_order',
      description: 'First-order approximation for early tuning',
      model_type: 'first_order',
      tau_s: 0.01,
      rate_max_deg_s: 300.0,
      delta_max_deg: 25.0,
      delta_min_deg: -25.0,
    },
    ideal_servo: {
      id: 'ideal_servo',
      description: 'Zero-dynamics ideal servo for analytical tests',
      model_type: 'ideal',
      rate_max_deg_s: 100000.0,
      delta_max_deg: 25.0,
      delta_min_deg: -25.0,
    },
    brushless_em: {
      id: 'brushless_em',
      description: 'Electromechanical (BLDC + gearbox) with hinge-moment loading',
      model_type: 'electromechanical',
      motor: {
        kt_Nm_per_A: 0.087,
        ke_Vs_per_rad: 0.087,
        R_ohm: 1.2,
        L_H: 1.5e-3,
        J_motor_kgm2: 4.5e-6,
      },
      gearbox: {
        ratio: 80.0,
        efficiency: 0.85,
      },
      rate_max_deg_s: 250.0,
      delta_max_deg: 20.0,
      delta_min_deg: -20.0,
      hinge_moment_curve_csv: 'data/hinge_moment.csv',
    },
  },
};

// === Slice ===

export const actuatorLibrarySlice = createSlice({
  name: 'actuatorLibrary',
  initialState,
  reducers: {
    addEntry: (state, action: PayloadAction<ActuatorEntry>) => {
      state.entries[action.payload.id] = action.payload;
    },
    updateEntry: (state, action: PayloadAction<{ id: string; patch: Partial<ActuatorEntry> }>) => {
      const { id, patch } = action.payload;
      if (state.entries[id]) {
        state.entries[id] = { ...state.entries[id], ...patch } as ActuatorEntry;
      }
    },
    removeEntry: (state, action: PayloadAction<string>) => {
      delete state.entries[action.payload];
    },
    setLibrary: (state, action: PayloadAction<Record<string, ActuatorEntry>>) => {
      state.entries = action.payload;
    },
  },
});

export const { addEntry, updateEntry, removeEntry, setLibrary } = actuatorLibrarySlice.actions;
export default actuatorLibrarySlice.reducer;
