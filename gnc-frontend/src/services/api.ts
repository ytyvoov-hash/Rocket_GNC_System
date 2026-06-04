import axios, { type AxiosInstance } from 'axios';
import type { RocketTemplate, ValidationReport } from '../store/rocketSlice';
import type { ActuatorEntry } from '../store/actuatorLibrarySlice';
import type { GainSet } from '../store/controllerLibrarySlice';
import type { HardwarePort, DeviceAssignment } from '../store/hardwareSlice';
import { keycloak } from './keycloak';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

let instance: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (!instance) {
    instance = axios.create({
      baseURL: BASE_URL,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });
    instance.interceptors.request.use((config) => {
      const token = keycloak?.token || localStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
    instance.interceptors.response.use(
      (r) => r,
      (err) => {
        if (err.response?.status === 401) {
          localStorage.removeItem('access_token');
          window.location.href = '/';
        }
        return Promise.reject(err);
      },
    );
  }
  return instance;
}

// === Templates ===

export async function fetchTemplates(params?: { type?: string; status?: string }): Promise<RocketTemplate[]> {
  const { data } = await getClient().get<unknown>('/templates', { params });
  return Array.isArray(data) ? (data as RocketTemplate[]) : [];
}

export async function fetchTemplate(id: string): Promise<RocketTemplate> {
  const { data } = await getClient().get<RocketTemplate>(`/templates/${id}`);
  return data;
}

export async function importTemplate(formData: FormData): Promise<{ template_id: string; validation: ValidationReport }> {
  const { data } = await getClient().post<{ template_id: string; validation: ValidationReport }>('/templates', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function patchTemplate(id: string, patch: unknown): Promise<RocketTemplate> {
  const { data } = await getClient().patch<RocketTemplate>(`/templates/${id}`, patch);
  return data;
}

export async function replaceTemplate(id: string, body: unknown): Promise<RocketTemplate> {
  const { data } = await getClient().put<RocketTemplate>(`/templates/${id}`, body);
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  await getClient().delete(`/templates/${id}`);
}

export async function validateTemplate(id: string): Promise<ValidationReport> {
  const { data } = await getClient().post<ValidationReport>(`/templates/${id}/validate`);
  return data;
}

export async function duplicateTemplate(id: string): Promise<RocketTemplate> {
  const { data } = await getClient().post<RocketTemplate>(`/templates/${id}/duplicate`);
  return data;
}

export async function fetchTemplateHistory(id: string): Promise<unknown[]> {
  const { data } = await getClient().get<unknown[]>(`/templates/${id}/history`);
  return data;
}

// === Actuator Library ===

export async function fetchActuatorLibrary(): Promise<Record<string, ActuatorEntry>> {
  const { data } = await getClient().get<Record<string, ActuatorEntry>>('/actuator-library');
  return data;
}

export async function patchActuatorLibrary(patch: unknown): Promise<Record<string, ActuatorEntry>> {
  const { data } = await getClient().patch<Record<string, ActuatorEntry>>('/actuator-library', patch);
  return data;
}

// === Controller Library ===

export async function fetchControllerLibrary(): Promise<Record<string, GainSet>> {
  const { data } = await getClient().get<Record<string, GainSet>>('/controller-library');
  return data;
}

export async function patchControllerLibrary(patch: unknown): Promise<Record<string, GainSet>> {
  const { data } = await getClient().patch<Record<string, GainSet>>('/controller-library', patch);
  return data;
}

// === Missions ===

export async function fetchMissions(): Promise<unknown[]> {
  const { data } = await getClient().get<unknown[]>('/missions');
  return data;
}

export async function fetchMission(id: string): Promise<unknown> {
  const { data } = await getClient().get<unknown>(`/missions/${id}`);
  return data;
}

export async function createMission(body: string): Promise<unknown> {
  const token = keycloak?.token || localStorage.getItem('access_token');
  const headers: HeadersInit = { 'Content-Type': 'text/plain' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/missions`, {
    method: 'POST',
    headers,
    body
  });
  
  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status}`);
  }
  return await res.json();
}

export async function lockMission(id: string): Promise<unknown> {
  const { data } = await getClient().post<unknown>(`/missions/${id}/lock`);
  return data;
}

// === Hardware ===
//
// All write paths on /hardware/* require X-Operator-ID + X-Reason headers
// (v5.4 §A.7 audit envelope). The backend will reject 400 if either header
// is absent or empty, so we fail fast on the FE if the caller forgets them.

export interface OperatorContext {
  operatorId: string;
  reason: string;
}

function operatorHeaders(ctx: OperatorContext): Record<string, string> {
  if (!ctx.operatorId || !ctx.reason) {
    throw new Error('Operator ID and Reason are required for hardware writes (v5.4 §A.7).');
  }
  return {
    'X-Operator-ID': ctx.operatorId,
    'X-Reason': ctx.reason,
  };
}

export async function fetchHardwareScan(): Promise<HardwarePort[]> {
  const { data } = await getClient().get<HardwarePort[]>('/hardware/scan');
  return Array.isArray(data) ? data : [];
}

export async function fetchDeviceAssignments(): Promise<DeviceAssignment[]> {
  const { data } = await getClient().get<DeviceAssignment[]>('/hardware/assignments');
  return Array.isArray(data) ? data : [];
}

export async function putDeviceAssignments(
  body: DeviceAssignment[],
  ctx: OperatorContext,
): Promise<DeviceAssignment[]> {
  const { data } = await getClient().put<DeviceAssignment[]>(
    '/hardware/assignments',
    body,
    { headers: operatorHeaders(ctx) },
  );
  return Array.isArray(data) ? data : [];
}

export async function fetchHardwareMapping(): Promise<unknown> {
  const { data } = await getClient().get<unknown>('/hardware-mapping');
  return data;
}

export async function patchHardwareMapping(
  patch: unknown,
  ctx: OperatorContext,
): Promise<unknown> {
  const { data } = await getClient().patch<unknown>(
    '/hardware-mapping',
    patch,
    { headers: operatorHeaders(ctx) },
  );
  return data;
}

// === Simulation ===

export async function startSimulation(params: unknown): Promise<{ runId: string }> {
  const { data } = await getClient().post<{ runId: string }>('/simulation/start', params);
  return data;
}

export async function stopSimulation(runId: string): Promise<void> {
  await getClient().post(`/simulation/${runId}/stop`);
}

// === Audit ===

export async function fetchAuditTrail(params?: { limit?: number }): Promise<unknown[]> {
  const { data } = await getClient().get<unknown[]>('/audit', { params });
  return data;
}

export default getClient;
