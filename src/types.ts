import type { IncomingHttpHeaders } from 'node:http';

// ── Route types ───────────────────────────────────

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
}

export interface ResourceConfig {
  basePath: string;
  seed: JsonValue;
  count?: number;
  idField?: string;
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
}

export interface RuntimeOverride {
  delay?: number;
  error?: number;
  disabled?: boolean;
}

export type LogListener = (entry: LogEntry) => void;

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
