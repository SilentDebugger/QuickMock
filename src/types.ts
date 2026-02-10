import type { IncomingHttpHeaders } from 'node:http';

// ── Route types ───────────────────────────────────

export interface SequenceStep {
  status?: number;
  response?: JsonValue;
  delay?: number;
  headers?: Record<string, string>;
  sticky?: boolean;
}

export interface RouteRule {
  when?: Record<string, string>;
  status?: number;
  response?: JsonValue;
  delay?: number;
  headers?: Record<string, string>;
}

export interface RouteConfig {
  method?: string;
  path: string;
  status?: number;
  response?: JsonValue;
  responses?: JsonValue[];
  headers?: Record<string, string>;
  delay?: number;
  error?: number;
  errorStatus?: number;
  sequence?: SequenceStep[];
  rules?: RouteRule[];
}

export interface Route {
  method: string;
  path: string;
  status: number;
  response?: JsonValue;
  responses?: JsonValue[];
  headers: Record<string, string>;
  delay?: number;
  error?: number;
  errorStatus?: number;
  sequence?: SequenceStep[];
  rules?: RouteRule[];
}

export interface RelationConfig {
  resource: string;
  field: string;
}

export interface ResourceConfig {
  basePath: string;
  seed: JsonValue;
  count?: number;
  idField?: string;
  delay?: number;
  error?: number;
  errorStatus?: number;
  relations?: Record<string, RelationConfig>;
}

export interface ResourceEntry {
  name: string;
  basePath: string;
  idField: string;
  delay?: number;
  error?: number;
  errorStatus?: number;
}

export interface RoutesFileConfig {
  routes?: RouteConfig[];
  resources?: Record<string, ResourceConfig>;
}

// ── Store types ──────────────────────────────────

export type JsonRecord = Record<string, JsonValue>;

// ── Dashboard types ──────────────────────────────

export interface LogEntry {
  method: string;
  path: string;
  status: number;
  ms: number;
  timestamp: number;
  serverId?: string;
  proxied?: boolean;
}

export interface RuntimeOverride {
  delay?: number;
  error?: number;
  disabled?: boolean;
  passthrough?: boolean;
}

export type LogListener = (entry: LogEntry) => void;

// ── Management types ─────────────────────────────

export interface MockServerConfig {
  id: string;
  name: string;
  description?: string;
  port: number;
  host: string;
  cors: boolean;
  delay: number;
  routes: RouteConfig[];
  resources: Record<string, ResourceConfig>;
  profiles: Record<string, Profile>;
  activeProfile?: string;
  proxyTarget?: string;
  createdAt: number;
  updatedAt: number;
}

export interface RecordedResponse {
  method: string;
  path: string;
  status: number;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  body?: string;
  timestamp: number;
}

export interface Profile {
  name: string;
  description?: string;
  disabledRoutes: number[];
  disabledResources: string[];
  overrides: {
    routes: Record<number, RuntimeOverride>;
    resources: Record<string, RuntimeOverride>;
  };
}

// ── Server types ──────────────────────────────────

export interface ServerOptions {
  port: number;
  host: string;
  watch: boolean;
  cors: boolean;
  delay: number;
}

// ── Template types ────────────────────────────────

export interface TemplateContext {
  params: Record<string, string>;
  body: JsonValue;
  query: Record<string, string>;
  headers: IncomingHttpHeaders;
}

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
