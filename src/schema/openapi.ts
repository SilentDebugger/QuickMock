import { parse as parseYaml } from 'yaml';
import type { RouteConfig, ResourceConfig, JsonValue } from '../types.js';

// ── Types ─────────────────────────────────────────

interface OpenApiSpec {
  openapi?: string;
  swagger?: string;
  paths?: Record<string, PathItem>;
  definitions?: Record<string, SchemaObject>;
  components?: { schemas?: Record<string, SchemaObject> };
}

interface PathItem {
  [method: string]: OperationObject | undefined;
}

interface OperationObject {
  operationId?: string;
  summary?: string;
  responses?: Record<string, ResponseObject>;
  requestBody?: { content?: Record<string, { schema?: SchemaObject }> };
  parameters?: ParameterObject[];
}

interface ResponseObject {
  description?: string;
  content?: Record<string, { schema?: SchemaObject }>;
  schema?: SchemaObject; // Swagger 2.x
}

interface ParameterObject {
  name: string;
  in: string;
  required?: boolean;
  schema?: SchemaObject;
}

interface SchemaObject {
  type?: string;
  format?: string;
  properties?: Record<string, SchemaObject>;
  items?: SchemaObject;
  $ref?: string;
  enum?: JsonValue[];
  required?: string[];
}

// ── Parser ────────────────────────────────────────

export interface ParseResult {
  routes: { path: string; config: RouteConfig }[];
  resources: { name: string; config: ResourceConfig }[];
}

/**
 * Parse an OpenAPI 3.x or Swagger 2.x spec and generate routes/resources.
 * Accepts a JSON string, YAML string, or parsed object.
 */
export function parseOpenApi(input: string | object): ParseResult {
  let spec: OpenApiSpec;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    // Try JSON first, fall back to YAML
    if (trimmed.startsWith('{')) {
      spec = JSON.parse(trimmed) as OpenApiSpec;
    } else {
      spec = parseYaml(trimmed) as OpenApiSpec;
    }
  } else {
    spec = input as OpenApiSpec;
  }
  const schemas = spec.components?.schemas ?? spec.definitions ?? {};
  const routes: ParseResult['routes'] = [];
  const resourcePaths = new Map<string, { basePath: string; methods: Set<string>; schema?: SchemaObject }>();

  if (!spec.paths) return { routes: [], resources: [] };

  for (const [pathStr, pathItem] of Object.entries(spec.paths)) {
    if (!pathItem) continue;

    const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];
    const pathMethods = new Set<string>();

    for (const method of httpMethods) {
      const op = pathItem[method] as OperationObject | undefined;
      if (!op) continue;
      pathMethods.add(method.toUpperCase());

      // Extract response schema for the success response
      const successCode = Object.keys(op.responses ?? {}).find(c => c.startsWith('2')) ?? '200';
      const responseObj = op.responses?.[successCode];
      let schema: SchemaObject | undefined;

      if (responseObj) {
        // OpenAPI 3.x
        const content = responseObj.content;
        if (content) {
          const jsonContent = content['application/json'] ?? content['*/*'];
          schema = jsonContent?.schema;
        }
        // Swagger 2.x
        if (!schema && responseObj.schema) {
          schema = responseObj.schema;
        }
      }

      // Convert path params from {id} to :id format
      const convertedPath = pathStr.replace(/\{(\w+)\}/g, ':$1');
      const statusCode = parseInt(successCode) || 200;

      // Build response template from schema
      const response = schema ? schemaToTemplate(schema, schemas) : null;

      routes.push({
        path: pathStr,
        config: {
          method: method.toUpperCase(),
          path: convertedPath,
          status: statusCode,
          response: response ?? undefined,
        },
      });
    }

    // Detect CRUD resource patterns (base path with GET+POST, base/:id with GET+PUT+DELETE)
    const basePath = pathStr.replace(/\/\{[^}]+\}$/, '');
    if (basePath !== pathStr || pathMethods.has('POST')) {
      if (!resourcePaths.has(basePath)) {
        resourcePaths.set(basePath, { basePath, methods: new Set(), schema: undefined });
      }
      const entry = resourcePaths.get(basePath)!;
      for (const m of pathMethods) entry.methods.add(m);

      // Try to extract schema for seed
      const getOp = pathItem['get'] as OperationObject | undefined;
      if (getOp && !entry.schema) {
        const successCode = Object.keys(getOp.responses ?? {}).find(c => c.startsWith('2')) ?? '200';
        const respObj = getOp.responses?.[successCode];
        const content = respObj?.content?.['application/json'] ?? respObj?.content?.['*/*'];
        let schema = content?.schema ?? respObj?.schema;
        // Resolve $ref
        if (schema?.$ref) {
          const refName = schema.$ref.split('/').pop()!;
          schema = schemas[refName];
        }
        // Unwrap to get the actual item schema
        if (schema) schema = unwrapItemSchema(schema, schemas);
        if (schema) entry.schema = schema;
      }
    }
  }

  // Generate resources from detected CRUD patterns
  const resources: ParseResult['resources'] = [];
  for (const [, entry] of resourcePaths) {
    if (entry.methods.size < 2) continue; // Need at least 2 methods for a resource

    const name = entry.basePath.split('/').filter(Boolean).pop() ?? 'items';
    const seed = entry.schema
      ? schemaToTemplate(entry.schema, schemas)
      : { id: '{{faker.id}}' };

    if (seed && typeof seed === 'object' && !Array.isArray(seed)) {
      // Ensure id field exists
      const seedObj = seed as Record<string, JsonValue>;
      if (!seedObj['id']) seedObj['id'] = '{{faker.id}}';

      resources.push({
        name,
        config: {
          basePath: entry.basePath.replace(/\{(\w+)\}/g, ':$1'),
          seed: seedObj,
          count: 5,
          idField: 'id',
        },
      });
    }
  }

  return { routes, resources };
}

// ── Schema unwrapping ─────────────────────────────

/**
 * Unwrap a response schema to find the actual item schema for resource seeding.
 * Handles: direct arrays, paginated wrappers (objects with an array property
 * like "items", "data", "results", "records"), and $ref resolution.
 */
function unwrapItemSchema(
  schema: SchemaObject,
  schemas: Record<string, SchemaObject>,
): SchemaObject | undefined {
  // Resolve $ref first
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop()!;
    const resolved = schemas[refName];
    if (resolved) return unwrapItemSchema(resolved, schemas);
    return undefined;
  }

  // Direct array: use items schema
  if (schema.type === 'array' && schema.items) {
    let itemSchema = schema.items;
    if (itemSchema.$ref) {
      const refName = itemSchema.$ref.split('/').pop()!;
      itemSchema = schemas[refName] ?? itemSchema;
    }
    return itemSchema;
  }

  // Paginated wrapper: object with a known array property containing items
  if (schema.type === 'object' && schema.properties) {
    const arrayPropNames = ['items', 'data', 'results', 'records', 'rows', 'entries', 'content', 'list'];
    for (const propName of arrayPropNames) {
      const prop = schema.properties[propName];
      if (prop && prop.type === 'array' && prop.items) {
        let itemSchema = prop.items;
        if (itemSchema.$ref) {
          const refName = itemSchema.$ref.split('/').pop()!;
          itemSchema = schemas[refName] ?? itemSchema;
        }
        return itemSchema;
      }
    }
  }

  // Not a collection schema -- return as-is (single item response)
  return schema;
}

// ── Schema → template ─────────────────────────────

function schemaToTemplate(
  schema: SchemaObject,
  schemas: Record<string, SchemaObject>,
  depth = 0,
): JsonValue {
  if (depth > 5) return null; // Prevent infinite recursion

  // Resolve $ref
  if (schema.$ref) {
    const refName = schema.$ref.split('/').pop()!;
    const resolved = schemas[refName];
    if (resolved) return schemaToTemplate(resolved, schemas, depth + 1);
    return null;
  }

  // Enum
  if (schema.enum && schema.enum.length > 0) {
    return schema.enum[0];
  }

  // Object
  if (schema.type === 'object' && schema.properties) {
    const obj: Record<string, JsonValue> = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      obj[key] = propertyToFaker(key, propSchema, schemas, depth);
    }
    return obj;
  }

  // Array
  if (schema.type === 'array' && schema.items) {
    return [schemaToTemplate(schema.items, schemas, depth + 1)];
  }

  // Primitives
  return typeToFaker(schema.type, schema.format);
}

function propertyToFaker(
  name: string,
  schema: SchemaObject,
  schemas: Record<string, SchemaObject>,
  depth: number,
): JsonValue {
  if (schema.$ref || schema.type === 'object' || schema.type === 'array') {
    return schemaToTemplate(schema, schemas, depth + 1);
  }
  if (schema.enum && schema.enum.length > 0) {
    return schema.enum[0];
  }

  const lowerName = name.toLowerCase();

  // Name-based heuristics
  if (lowerName === 'id' || lowerName.endsWith('_id') || lowerName.endsWith('Id')) return '{{faker.id}}';
  if (lowerName === 'email' || lowerName.includes('email')) return '{{faker.email}}';
  if (lowerName === 'name' || lowerName === 'full_name') return '{{faker.name}}';
  if (lowerName === 'first_name' || lowerName === 'firstname') return '{{faker.firstName}}';
  if (lowerName === 'last_name' || lowerName === 'lastname') return '{{faker.lastName}}';
  if (lowerName === 'phone') return '{{faker.phone}}';
  if (lowerName === 'avatar' || lowerName === 'image' || lowerName === 'photo') return '{{faker.avatar}}';
  if (lowerName === 'url' || lowerName === 'website') return '{{faker.url}}';
  if (lowerName === 'title') return '{{faker.title}}';
  if (lowerName === 'slug') return '{{faker.slug}}';
  if (lowerName === 'company' || lowerName === 'organization') return '{{faker.company}}';
  if (lowerName === 'description' || lowerName === 'bio' || lowerName === 'body' || lowerName === 'content') return '{{faker.paragraph}}';
  if (lowerName.includes('created') || lowerName.includes('updated') || lowerName.endsWith('_at') || lowerName === 'date') return '{{faker.date}}';
  if (lowerName === 'color') return '{{faker.color}}';
  if (lowerName === 'ip') return '{{faker.ip}}';

  return typeToFaker(schema.type, schema.format);
}

function typeToFaker(type?: string, format?: string): JsonValue {
  if (format === 'uuid')       return '{{faker.id}}';
  if (format === 'email')      return '{{faker.email}}';
  if (format === 'uri')        return '{{faker.url}}';
  if (format === 'date-time')  return '{{faker.date}}';
  if (format === 'date')       return '{{faker.date}}';

  switch (type) {
    case 'string':  return '{{faker.lorem}}';
    case 'integer': return '{{faker.number}}';
    case 'number':  return '{{faker.number}}';
    case 'boolean': return '{{faker.boolean}}';
    default:        return '{{faker.lorem}}';
  }
}
