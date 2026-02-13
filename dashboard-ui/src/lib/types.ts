export interface ServerStatus {
  config: MockServerConfig;
  running: boolean;
  port: number;
  routeCount: number;
  resourceCount: number;
  resourceItems: Record<string, number>;
}

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
  proxyHeaders?: Record<string, string>;
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

export interface SequenceStep {
  status?: number;
  response?: unknown;
  delay?: number;
  headers?: Record<string, string>;
  sticky?: boolean;
}

export interface RouteRule {
  when?: Record<string, string>;
  status?: number;
  response?: unknown;
  delay?: number;
  headers?: Record<string, string>;
}

export interface RouteConfig {
  method?: string;
  path: string;
  status?: number;
  response?: unknown;
  responses?: unknown[];
  headers?: Record<string, string>;
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
  seed: unknown;
  count?: number;
  idField?: string;
  delay?: number;
  error?: number;
  errorStatus?: number;
  relations?: Record<string, RelationConfig>;
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

export interface RuntimeOverride {
  delay?: number;
  error?: number;
  disabled?: boolean;
  passthrough?: boolean;
}

export interface LogEntry {
  method: string;
  path: string;
  status: number;
  ms: number;
  timestamp: number;
  serverId?: string;
  proxied?: boolean;
}

export interface ServerDetail {
  config: MockServerConfig;
  running: boolean;
  routeCount: number;
  resourceCount: number;
  resourceItems: Record<string, number>;
  routeOverrides?: Record<number, RuntimeOverride>;
  resourceOverrides?: Record<string, RuntimeOverride>;
}
