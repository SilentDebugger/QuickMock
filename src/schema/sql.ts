import type { ResourceConfig, RelationConfig, JsonValue } from '../types.js';

// ── SQL DDL Parser ────────────────────────────────

interface Column {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  references?: { table: string; column: string };
}

interface Table {
  name: string;
  columns: Column[];
}

/**
 * Parse SQL DDL text (CREATE TABLE statements) and generate ResourceConfig[].
 * Supports standard SQL types and infers appropriate faker generators.
 */
export function parseSqlDdl(sql: string): { name: string; config: ResourceConfig }[] {
  const tables = extractTables(sql);
  return tables.map(table => {
    const basePath = `/api/${toSlug(table.name)}`;
    const idCol = table.columns.find(c => c.primaryKey)?.name ?? 'id';
    const seed: Record<string, JsonValue> = {};
    const relations: Record<string, RelationConfig> = {};

    for (const col of table.columns) {
      seed[col.name] = mapColumnToFaker(col);

      // Emit relation from foreign key references
      if (col.references) {
        relations[col.name] = {
          resource: toSlug(col.references.table),
          field: col.references.column,
        };
      }
    }

    const config: ResourceConfig = {
      basePath,
      seed,
      count: 5,
      idField: idCol,
    };

    if (Object.keys(relations).length > 0) {
      config.relations = relations;
    }

    return { name: toSlug(table.name), config };
  });
}

// ── Table extraction ──────────────────────────────

function extractTables(sql: string): Table[] {
  const tables: Table[] = [];
  // Match CREATE TABLE statements
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(([\s\S]*?)\)\s*;/gi;

  let match;
  while ((match = tableRegex.exec(sql)) !== null) {
    const name = match[1];
    const body = match[2];
    const columns = parseColumns(body);
    if (columns.length > 0) {
      tables.push({ name, columns });
    }
  }

  return tables;
}

function parseColumns(body: string): Column[] {
  const columns: Column[] = [];
  const lines = body.split(',').map(l => l.trim()).filter(Boolean);

  // Track table-level constraints
  const pkColumns: string[] = [];

  for (const line of lines) {
    const upper = line.toUpperCase().trim();

    // Skip table-level constraints but extract PK info
    if (upper.startsWith('PRIMARY KEY')) {
      const pkMatch = line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        pkColumns.push(...pkMatch[1].split(',').map(s => s.trim().replace(/[`"']/g, '')));
      }
      continue;
    }
    if (upper.startsWith('FOREIGN KEY') || upper.startsWith('UNIQUE') ||
        upper.startsWith('CHECK') || upper.startsWith('INDEX') ||
        upper.startsWith('CONSTRAINT')) {
      continue;
    }

    // Parse column definition
    const colMatch = line.match(/^[`"']?(\w+)[`"']?\s+(\w+(?:\([^)]*\))?)/i);
    if (!colMatch) continue;

    const name = colMatch[1];
    const type = colMatch[2].toUpperCase();
    const nullable = !upper.includes('NOT NULL');
    const primaryKey = upper.includes('PRIMARY KEY') || upper.includes('AUTOINCREMENT') || upper.includes('AUTO_INCREMENT');

    // Check for REFERENCES
    let references: Column['references'];
    const refMatch = line.match(/REFERENCES\s+[`"']?(\w+)[`"']?\s*\([`"']?(\w+)[`"']?\)/i);
    if (refMatch) {
      references = { table: refMatch[1], column: refMatch[2] };
    }

    columns.push({ name, type, nullable, primaryKey, references });
  }

  // Apply table-level PKs
  for (const pkName of pkColumns) {
    const col = columns.find(c => c.name === pkName);
    if (col) col.primaryKey = true;
  }

  return columns;
}

// ── Type → faker mapping ──────────────────────────

function mapColumnToFaker(col: Column): JsonValue {
  const type = col.type.toUpperCase().replace(/\(.*\)/, '');
  const name = col.name.toLowerCase();

  // Name-based heuristics first
  if (col.primaryKey && (name === 'id' || name.endsWith('_id'))) return '{{faker.id}}';
  if (col.references) return '{{faker.id}}';
  if (name === 'email' || name.endsWith('_email'))  return '{{faker.email}}';
  if (name === 'name' || name === 'full_name' || name === 'fullname')  return '{{faker.name}}';
  if (name === 'first_name' || name === 'firstname') return '{{faker.firstName}}';
  if (name === 'last_name' || name === 'lastname')   return '{{faker.lastName}}';
  if (name === 'phone' || name === 'phone_number')   return '{{faker.phone}}';
  if (name === 'avatar' || name === 'image' || name === 'photo' || name === 'picture') return '{{faker.avatar}}';
  if (name === 'url' || name === 'website' || name === 'link')  return '{{faker.url}}';
  if (name === 'title')  return '{{faker.title}}';
  if (name === 'slug')   return '{{faker.slug}}';
  if (name === 'color' || name === 'colour')  return '{{faker.color}}';
  if (name === 'ip' || name === 'ip_address') return '{{faker.ip}}';
  if (name === 'company' || name === 'organization')  return '{{faker.company}}';
  if (name === 'description' || name === 'bio' || name === 'summary' || name === 'content' || name === 'body') return '{{faker.paragraph}}';

  // Date/time columns
  if (name.includes('created') || name.includes('updated') || name.includes('deleted') ||
      name.endsWith('_at') || name.endsWith('_date') || name === 'date' || name === 'timestamp') {
    return '{{faker.date}}';
  }

  // Type-based fallback
  switch (type) {
    case 'INT': case 'INTEGER': case 'SMALLINT': case 'BIGINT':
    case 'TINYINT': case 'MEDIUMINT': case 'SERIAL': case 'BIGSERIAL':
      return '{{faker.number}}';
    case 'FLOAT': case 'DOUBLE': case 'DECIMAL': case 'NUMERIC': case 'REAL':
      return '{{faker.number}}';
    case 'BOOLEAN': case 'BOOL': case 'BIT':
      return '{{faker.boolean}}';
    case 'DATE': case 'DATETIME': case 'TIMESTAMP': case 'TIMESTAMPTZ': case 'TIME':
      return '{{faker.date}}';
    case 'UUID':
      return '{{faker.id}}';
    case 'TEXT': case 'LONGTEXT': case 'MEDIUMTEXT':
      return '{{faker.paragraph}}';
    case 'VARCHAR': case 'CHAR': case 'NVARCHAR': case 'NCHAR': case 'CHARACTER':
      return '{{faker.lorem}}';
    case 'JSON': case 'JSONB':
      return {};
    default:
      return '{{faker.lorem}}';
  }
}

// ── Helpers ───────────────────────────────────────

function toSlug(name: string): string {
  return name
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '')
    .replace(/_+/g, '_');
}
