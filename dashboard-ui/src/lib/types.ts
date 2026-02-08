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
  createdAt: number;
  updatedAt: number;
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
}

export interface ResourceConfig {
  basePath: string;
  seed: unknown;
  count?: number;
  idField?: string;
  delay?: number;
  error?: number;
  errorStatus?: number;
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
}

export interface LogEntry {
  method: string;
  path: string;
  status: number;
  ms: number;
  timestamp: number;
  serverId?: string;
}

export interface ServerDetail {
  config: MockServerConfig;
  running: boolean;
  routeCount: number;
  resourceCount: number;
  resourceItems: Record<string, number>;
}
