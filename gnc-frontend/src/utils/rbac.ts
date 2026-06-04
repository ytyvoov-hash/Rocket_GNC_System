export type GncRole = 'admin' | 'operator' | 'engineer' | 'viewer' | null;

export const canArm = (role: GncRole): boolean =>
  role === 'operator' || role === 'admin';

export const canEditTemplate = (role: GncRole): boolean =>
  role === 'engineer' || role === 'admin';

export const canViewOnly = (role: GncRole): boolean =>
  role === 'viewer';
