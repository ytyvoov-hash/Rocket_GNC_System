import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  isAuthenticated: boolean;
  operatorId: string | null;
  role: 'admin' | 'engineer' | 'operator' | 'viewer' | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  operatorId: null,
  role: null,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login: (state, action: PayloadAction<{ operatorId: string; role: 'admin' | 'engineer' | 'operator' | 'viewer' }>) => {
      state.isAuthenticated = true;
      state.operatorId = action.payload.operatorId;
      state.role = action.payload.role;
    },
    logout: (state) => {
      state.isAuthenticated = false;
      state.operatorId = null;
      state.role = null;
    },
  },
});

export const { login, logout } = authSlice.actions;
export default authSlice.reducer;
