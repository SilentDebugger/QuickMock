import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, FileJson, ArrowRight, Check } from 'lucide-react';
import { schema, servers } from '../lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { cn, METHOD_BG } from '../lib/utils';
import type { RouteConfig, ResourceConfig } from '../lib/types';

type ImportType = 'sql' | 'openapi' | null;

export default function ImportWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [type, setType] = useState<ImportType>(null);
  const [input, setInput] = useState('');
  const [previewResources, setPreviewResources] = useState<Record<string, ResourceConfig> | null>(null);
  const [previewRoutes, setPreviewRoutes] = useState<RouteConfig[]>([]);
  const [serverName, setServerName] = useState('');
  const [port, setPort] = useState(3001);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleParse = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setError('');
    try {
      if (type === 'sql') {
        const result = await schema.importSql(input);
        setPreviewResources(result.resources);
        setPreviewRoutes([]);
        const names = Object.keys(result.resources);
        if (!serverName) setServerName(names.length > 0 ? `${names[0]}-api` : 'imported-api');
      } else if (type === 'openapi') {
        const result = await schema.importOpenApi(input);
        const resources: Record<string, ResourceConfig> = {};
        for (const r of result.resources as { name: string; config: ResourceConfig }[]) {
          resources[r.name] = r.config;
        }
        // Collect non-resource routes (endpoints that weren't converted to CRUD resources)
        const resourceBasePaths = new Set(Object.values(resources).map(r => r.basePath));
        const standaloneRoutes: RouteConfig[] = [];
        for (const r of result.routes as { path: string; config: RouteConfig }[]) {
          const routePath = r.config.path;
          // Skip routes that are already covered by a resource's CRUD endpoints
          const coveredByResource = [...resourceBasePaths].some(bp => {
            const basePlain = bp.replace(/\/:[^/]+/g, '');
            const routePlain = routePath.replace(/\/:[^/]+/g, '');
            return routePlain === basePlain || routePlain.startsWith(basePlain + '/');
          });
          if (!coveredByResource) {
            standaloneRoutes.push(r.config);
          }
        }
        setPreviewResources(resources);
        setPreviewRoutes(standaloneRoutes);
        if (!serverName) setServerName('openapi-mock');
      }
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!previewResources && previewRoutes.length === 0) return;
    setLoading(true);
    try {
      const config = await servers.create({
        name: serverName || 'Imported Server',
        port,
        resources: previewResources ?? {},
        routes: previewRoutes,
      });
      qc.invalidateQueries({ queryKey: ['servers'] });
      navigate(`/servers/${config.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  const hasPreview = previewResources || previewRoutes.length > 0;

  const resetPreview = () => {
    setPreviewResources(null);
    setPreviewRoutes([]);
  };

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-lg font-semibold mb-1">Import Schema</h1>
      <p className="text-sm text-zinc-500 mb-6">Generate a mock API from a database schema or OpenAPI spec.</p>

      {/* Step 1: Choose type */}
      {!type && (
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setType('sql')}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors text-left"
          >
            <Database className="w-8 h-8 text-pink-400 mb-3" />
            <h3 className="font-medium mb-1">SQL Schema</h3>
            <p className="text-sm text-zinc-500">Paste CREATE TABLE statements to auto-generate CRUD resources.</p>
          </button>
          <button
            onClick={() => setType('openapi')}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors text-left"
          >
            <FileJson className="w-8 h-8 text-blue-400 mb-3" />
            <h3 className="font-medium mb-1">OpenAPI / Swagger</h3>
            <p className="text-sm text-zinc-500">Paste an OpenAPI 3.x or Swagger 2.x spec (JSON or YAML) to generate routes.</p>
          </button>
        </div>
      )}

      {/* Step 2: Input */}
      {type && !hasPreview && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => setType(null)} className="text-sm text-zinc-500 hover:text-zinc-300">&larr; Back</button>
            <span className="text-sm text-zinc-500">|</span>
            <span className="text-sm font-medium">{type === 'sql' ? 'SQL Schema' : 'OpenAPI Spec'}</span>
          </div>

          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            rows={16}
            spellCheck={false}
            placeholder={type === 'sql'
              ? 'CREATE TABLE users (\n  id UUID PRIMARY KEY,\n  name VARCHAR(100) NOT NULL,\n  email VARCHAR(255) UNIQUE NOT NULL,\n  created_at TIMESTAMP DEFAULT NOW()\n);\n\nCREATE TABLE posts (\n  id SERIAL PRIMARY KEY,\n  title VARCHAR(200) NOT NULL,\n  body TEXT,\n  author_id UUID REFERENCES users(id),\n  published_at TIMESTAMP\n);'
              : 'openapi: 3.1.0\ninfo:\n  title: My API\n  version: 1.0.0\npaths:\n  /api/users:\n    get:\n      responses:\n        "200":\n          description: OK\n\n# Also accepts JSON format'}
            className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-mono resize-y focus:outline-none focus:border-pink-500"
          />

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleParse}
            disabled={loading || !input.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            {loading ? 'Parsing...' : 'Parse & Preview'}
          </button>
        </div>
      )}

      {/* Step 3: Preview & Create */}
      {hasPreview && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <button onClick={resetPreview} className="text-sm text-zinc-500 hover:text-zinc-300">&larr; Back</button>
            <span className="text-sm text-zinc-500">|</span>
            <span className="text-sm font-medium">Preview</span>
          </div>

          {/* Routes preview */}
          {previewRoutes.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-medium mb-3 text-zinc-400">Generated Routes ({previewRoutes.length})</h3>
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {previewRoutes.map((route, i) => (
                  <div key={i} className="flex items-center gap-3 py-1.5">
                    <span className={cn('px-2 py-0.5 rounded text-[10px] font-mono font-bold', METHOD_BG[route.method ?? 'GET'])}>
                      {(route.method ?? 'GET').padEnd(6)}
                    </span>
                    <span className="font-mono text-xs text-zinc-300">{route.path}</span>
                    <span className="text-[10px] text-zinc-600">-&gt; {route.status ?? 200}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resources preview */}
          {previewResources && Object.keys(previewResources).length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
              <h3 className="text-sm font-medium mb-3 text-zinc-400">Generated Resources ({Object.keys(previewResources).length})</h3>
              <div className="space-y-2">
                {Object.entries(previewResources).map(([name, config]) => (
                  <div key={name} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm font-medium text-pink-400">{name}</span>
                      <span className="text-xs text-zinc-500 font-mono">{config.basePath}</span>
                    </div>
                    <span className="text-xs text-zinc-500">{config.count ?? 5} items, ID: {config.idField ?? 'id'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="text-xs text-zinc-500">
            Total: {previewRoutes.length} routes + {Object.keys(previewResources ?? {}).length} resources
            (each resource auto-generates GET, POST, PUT, PATCH, DELETE endpoints)
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Server Name</label>
              <input value={serverName} onChange={e => setServerName(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm focus:outline-none focus:border-pink-500" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Port</label>
              <input type="number" value={port} onChange={e => setPort(parseInt(e.target.value) || 3001)}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-pink-500" />
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Check className="w-4 h-4" />
            {loading ? 'Creating...' : 'Create Mock Server'}
          </button>
        </div>
      )}
    </div>
  );
}
