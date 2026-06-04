import { describe, it, expect } from 'vitest';
import missionReducer, {
  lockMission,
  unlockMission,
  setMissionField,
  setPath,
  resetMission,
} from '../../src/store/missionSlice';

const initial = missionReducer(undefined, { type: '@@INIT' });

describe('missionSlice', () => {
  it('starts unlocked with default fields', () => {
    expect(initial.locked).toBe(false);
    expect(initial.loop_rate_hz).toBe(100);
    expect(initial.path).toBe('A');
  });

  describe('lockMission / unlockMission', () => {
    it('lockMission sets locked=true', () => {
      expect(missionReducer(initial, lockMission()).locked).toBe(true);
    });

    it('unlockMission sets locked=false', () => {
      const locked = missionReducer(initial, lockMission());
      expect(missionReducer(locked, unlockMission()).locked).toBe(false);
    });
  });

  describe('setMissionField', () => {
    it('updates loop_rate_hz', () => {
      const state = missionReducer(initial, setMissionField({ loop_rate_hz: 500 }));
      expect(state.loop_rate_hz).toBe(500);
    });

    it('updates cep_target_m without touching other fields', () => {
      const state = missionReducer(initial, setMissionField({ cep_target_m: 25 }));
      expect(state.cep_target_m).toBe(25);
      expect(state.path).toBe(initial.path);
    });
  });

  describe('setPath', () => {
    it('path A yields loop_rate_hz=100', () => {
      const state = missionReducer(initial, setPath('A'));
      expect(state.path).toBe('A');
      expect(state.loop_rate_hz).toBe(100);
    });

    it('path B yields loop_rate_hz=200', () => {
      const state = missionReducer(initial, setPath('B'));
      expect(state.path).toBe('B');
      expect(state.loop_rate_hz).toBe(200);
    });
  });

  describe('resetMission', () => {
    it('resets to initial state', () => {
      const modified = missionReducer(initial, setMissionField({ loop_rate_hz: 999, locked: true }));
      expect(missionReducer(modified, resetMission())).toEqual(initial);
    });
  });
});
