import { describe, it, expect } from 'vitest';
import authReducer, { login, logout } from '../../src/store/authSlice';

const initial = { isAuthenticated: false, operatorId: null, role: null };

describe('authSlice', () => {
  it('has correct initial state', () => {
    expect(authReducer(undefined, { type: '@@INIT' })).toEqual(initial);
  });

  it('login sets isAuthenticated, operatorId, and role', () => {
    const state = authReducer(initial, login({ operatorId: 'alice', role: 'operator' }));
    expect(state.isAuthenticated).toBe(true);
    expect(state.operatorId).toBe('alice');
    expect(state.role).toBe('operator');
  });

  it('login accepts all four roles', () => {
    for (const role of ['admin', 'engineer', 'operator', 'viewer'] as const) {
      const state = authReducer(initial, login({ operatorId: 'u', role }));
      expect(state.role).toBe(role);
    }
  });

  it('logout resets state to initial', () => {
    const loggedIn = authReducer(initial, login({ operatorId: 'alice', role: 'admin' }));
    expect(authReducer(loggedIn, logout())).toEqual(initial);
  });
});
