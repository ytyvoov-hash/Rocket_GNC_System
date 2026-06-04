import type { AppDispatch } from '../store/store';
import { writeAudit, type AuditEntry } from '../store/systemSlice';

const apiBase = (): string =>
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export function auditWrite(
  dispatch: AppDispatch,
  operator: string,
  action: string,
): void {
  const entry: AuditEntry = { ts: Date.now(), operator, action };
  dispatch(writeAudit(entry));
  fetch(`${apiBase()}/api/v1/audit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => { /* fire-and-forget — server-side logging is best-effort */ });
}
