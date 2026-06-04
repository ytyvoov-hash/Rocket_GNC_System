import { describe, it, expect } from 'vitest';
import { canArm, canEditTemplate, canViewOnly } from '../../src/utils/rbac';

describe('canArm', () => {
  it('grants arm to operator', () => expect(canArm('operator')).toBe(true));
  it('grants arm to admin',    () => expect(canArm('admin')).toBe(true));
  it('denies arm to engineer', () => expect(canArm('engineer')).toBe(false));
  it('denies arm to viewer',   () => expect(canArm('viewer')).toBe(false));
  it('denies arm to null',     () => expect(canArm(null)).toBe(false));
});

describe('canEditTemplate', () => {
  it('grants edit to engineer', () => expect(canEditTemplate('engineer')).toBe(true));
  it('grants edit to admin',    () => expect(canEditTemplate('admin')).toBe(true));
  it('denies edit to operator', () => expect(canEditTemplate('operator')).toBe(false));
  it('denies edit to viewer',   () => expect(canEditTemplate('viewer')).toBe(false));
  it('denies edit to null',     () => expect(canEditTemplate(null)).toBe(false));
});

describe('canViewOnly', () => {
  it('returns true for viewer',  () => expect(canViewOnly('viewer')).toBe(true));
  it('returns false for admin',  () => expect(canViewOnly('admin')).toBe(false));
  it('returns false for null',   () => expect(canViewOnly(null)).toBe(false));
});
