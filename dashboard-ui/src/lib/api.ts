import type { ServerStatus, ServerDetail, MockServerConfig, RouteConfig, ResourceConfig, RecordedResponse } from './types';

const BASE = '/__api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || res.statusText);
  }
  return res.json() as Promise<T>;
}

// ── Servers ───────────────────────────────────────

export const servers = {
  list:   ()     => request<ServerStatus[]>('/servers'),
  get:    (id: string) => request<ServerDetail>(`/servers/${id}`),
  create: (data: Partial<MockServerConfig>) => request<MockServerConfig>('/servers', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<MockServerConfig>) => request<MockServerConfig>(`/servers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/servers/${id}`, { method: 'DELETE' }),
  start:  (id: string) => request<void>(`/servers/${id}/start`, { method: 'POST' }),
  stop:   (id: string) => request<void>(`/servers/${id}/stop`, { method: 'POST' }),
};

// ── Routes ────────────────────────────────────────

export const routes = {
  list:   (serverId: string) => request<RouteConfig[]>(`/servers/${serverId}/routes`),
  create: (serverId: string, route: RouteConfig) => request<RouteConfig>(`/servers/${serverId}/routes`, { method: 'POST', body: JSON.stringify(route) }),
  update: (serverId: string, idx: number, data: Partial<RouteConfig>) => request<RouteConfig>(`/servers/${serverId}/routes/${idx}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (serverId: string, idx: number) => request<void>(`/servers/${serverId}/routes/${idx}`, { method: 'DELETE' }),
};

// ── Resources ─────────────────────────────────────

export const resources = {
  list:   (serverId: string) => request<Record<string, ResourceConfig>>(`/servers/${serverId}/resources`),
  create: (serverId: string, name: string, config: ResourceConfig) => request<void>(`/servers/${serverId}/resources`, { method: 'POST', body: JSON.stringify({ name, config }) }),
  update: (serverId: string, name: string, data: Partial<ResourceConfig>) => request<ResourceConfig>(`/servers/${serverId}/resources/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (serverId: string, name: string) => request<void>(`/servers/${serverId}/resources/${encodeURIComponent(name)}`, { method: 'DELETE' }),
};

// ── Profiles ──────────────────────────────────────

export const profiles = {
  list:     (serverId: string) => request<{ profiles: Record<string, unknown>; activeProfile?: string }>(`/servers/${serverId}/profiles`),
  create:   (serverId: string, name: string, description?: string) => request<void>(`/servers/${serverId}/profiles`, { method: 'POST', body: JSON.stringify({ name, description }) }),
  update:   (serverId: string, name: string, data: unknown) => request<void>(`/servers/${serverId}/profiles/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete:   (serverId: string, name: string) => request<void>(`/servers/${serverId}/profiles/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  activate: (serverId: string, name: string) => request<void>(`/servers/${serverId}/profiles/${encodeURIComponent(name)}/activate`, { method: 'POST' }),
};

// ── Schema import ─────────────────────────────────

export const schema = {
  importSql:     (sql: string) => request<{ resources: Record<string, ResourceConfig> }>('/import/sql', { method: 'POST', body: JSON.stringify({ sql }) }),
  importOpenApi: (spec: string) => request<{ routes: unknown[]; resources: unknown[] }>('/import/openapi', { method: 'POST', body: spec, headers: { 'Content-Type': 'text/plain' } }),
  importHar:     (har: string, baseUrl?: string) => request<{ routes: unknown[]; resources: unknown[] }>('/import/har', { method: 'POST', body: JSON.stringify({ har, baseUrl }) }),
};

// ── Runtime overrides ─────────────────────────────

export const overrides = {
  patchRoute:    (serverId: string, idx: number, data: unknown) => request<void>(`/servers/${serverId}/overrides/routes/${idx}`, { method: 'PATCH', body: JSON.stringify(data) }),
  patchResource: (serverId: string, name: string, data: unknown) => request<void>(`/servers/${serverId}/overrides/resources/${encodeURIComponent(name)}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

// ── Docs & types ──────────────────────────────────

export const docs = {
  markdown: async (serverId: string): Promise<string> => {
    const res = await fetch(`${BASE}/servers/${serverId}/docs`);
    if (!res.ok) throw new Error('Failed to fetch docs');
    return res.text();
  },
  types: async (serverId: string): Promise<string> => {
    const res = await fetch(`${BASE}/servers/${serverId}/types`);
    if (!res.ok) throw new Error('Failed to fetch types');
    return res.text();
  },
  exportConfig: (serverId: string) => `${BASE}/servers/${serverId}/export`,
};

// ── Recordings ────────────────────────────────────

export const recordings = {
  list:    (serverId: string) => request<RecordedResponse[]>(`/servers/${serverId}/recordings`),
  clear:   (serverId: string) => request<void>(`/servers/${serverId}/recordings`, { method: 'DELETE' }),
  promote: (serverId: string, idx: number) => request<RouteConfig>(`/servers/${serverId}/recordings/${idx}/promote`, { method: 'POST' }),
};
