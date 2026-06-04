import { describe, it, expect } from 'vitest';
import systemReducer, {
  armLaunch,
  initiateLaunch,
  abort,
  writeAudit,
  updateChecklist,
  setTMinus,
  resetSystem,
} from '../../src/store/systemSlice';

const initial = systemReducer(undefined, { type: '@@INIT' });

describe('systemSlice', () => {
  it('has IDLE initial launchState', () => {
    expect(initial.launchState).toBe('IDLE');
    expect(initial.launchArmed).toBe(false);
    expect(initial.launchInitiated).toBe(false);
  });

  describe('armLaunch', () => {
    it('armLaunch(true) sets launchArmed and launchState=ARMED', () => {
      const state = systemReducer(initial, armLaunch(true));
      expect(state.launchArmed).toBe(true);
      expect(state.launchState).toBe('ARMED');
    });

    it('armLaunch(false) clears launchArmed but does not change launchState', () => {
      const armed = systemReducer(initial, armLaunch(true));
      const state = systemReducer(armed, armLaunch(false));
      expect(state.launchArmed).toBe(false);
    });
  });

  describe('initiateLaunch', () => {
    it('sets launchInitiated=true and launchState=LAUNCHED', () => {
      const state = systemReducer(initial, initiateLaunch());
      expect(state.launchInitiated).toBe(true);
      expect(state.launchState).toBe('LAUNCHED');
    });
  });

  describe('abort', () => {
    it('sets launchState=ABORTED, resets launchArmed, stores reason', () => {
      const armed = systemReducer(initial, armLaunch(true));
      const state = systemReducer(armed, abort('OPERATOR_ABORT'));
      expect(state.launchState).toBe('ABORTED');
      expect(state.launchArmed).toBe(false);
      expect(state.abortReason).toBe('OPERATOR_ABORT');
    });
  });

  describe('writeAudit', () => {
    it('appends entry to auditLog', () => {
      const entry = { ts: 1000, operator: 'alice', action: 'ARM' };
      const state = systemReducer(initial, writeAudit(entry));
      expect(state.auditLog).toHaveLength(1);
      expect(state.auditLog[0]).toEqual(entry);
    });

    it('accumulates multiple entries', () => {
      let state = initial;
      state = systemReducer(state, writeAudit({ ts: 1, operator: 'a', action: 'ARM' }));
      state = systemReducer(state, writeAudit({ ts: 2, operator: 'a', action: 'LAUNCH' }));
      expect(state.auditLog).toHaveLength(2);
    });
  });

  describe('updateChecklist', () => {
    it('sets launchState=CHECKLIST when progress >= 24', () => {
      const state = systemReducer(initial, updateChecklist(24));
      expect(state.launchState).toBe('CHECKLIST');
    });

    it('does not change launchState for progress < 24', () => {
      const state = systemReducer(initial, updateChecklist(12));
      expect(state.launchState).toBe('IDLE');
    });
  });

  describe('setTMinus', () => {
    it('sets launchState=COUNTDOWN for positive value', () => {
      const state = systemReducer(initial, setTMinus(10));
      expect(state.launchState).toBe('COUNTDOWN');
      expect(state.tMinusSeconds).toBe(10);
    });
  });

  describe('resetSystem', () => {
    it('resets to initial state', () => {
      const armed = systemReducer(initial, armLaunch(true));
      expect(systemReducer(armed, resetSystem())).toEqual(initial);
    });
  });
});
