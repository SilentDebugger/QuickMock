import { useState, useEffect, useCallback, useMemo } from 'react';
import { Trash2, ArrowUpFromLine, RefreshCw, Sparkles, Plus, Server, Check, Lock, Search } from 'lucide-react';
import { recordings, type GenerateResult } from '../lib/api';
import type { RecordedResponse } from '../lib/types';
import { cn, METHOD_BG } from '../lib/utils';
import { useQueryClient } from '@tanstack/react-query';

const METHOD_COLORS: Record<string, string> = {
  GET:    'text-emerald-400',
  POST:   'text-blue-400',
  PUT:    'text-amber-400',
  PATCH:  'text-violet-400',
  DELETE: 'text-red-400',
};

const METHODS = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** Headers that indicate authentication. */
const AUTH_HEADERS = new Set(['authorization', 'x-api-key', 'cookie']);

function hasAuth(rec: RecordedResponse): boolean {
  if (!rec.requestHeaders) return false;
  return Object.keys(rec.requestHeaders).some(k => AUTH_HEADERS.has(k.toLowerCase()));
}

export default function RecordingsViewer({ serverId }: { serverId: string }) {
  const qc = useQueryClient();
  const [items, setItems] = useState<RecordedResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [detailTab, setDetailTab] = useState<'request' | 'response'>('response');

  // Filters
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [pathSearch, setPathSearch] = useState('');

  // Generate flow state
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<GenerateResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('Generated Mock');
  const [newPort, setNewPort] = useState(3001);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    recordings.list(serverId)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [serverId]);

  useEffect(load, [load]);

  const filtered = useMemo(() => {
    return items.filter(rec => {
      if (methodFilter !== 'ALL' && rec.method !== methodFilter) return false;
      if (pathSearch && !rec.path.toLowerCase().includes(pathSearch.toLowerCase())) return false;
      return true;
    });
  }, [items, methodFilter, pathSearch]);

  async function handleClear() {
    await recordings.clear(serverId);
    setItems([]);
    setPreview(null);
  }

  async function handlePromote(idx: number) {
    await recordings.promote(serverId, idx);
    qc.invalidateQueries({ queryKey: ['server', serverId] });
    load();
  }

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    try {
      const result = await recordings.generate(serverId);
      setPreview(result);
    } catch (err) {
      setError((err as Error).message);
    }
    setGenerating(false);
  }

  async function handleApply(target: 'same' | 'new') {
    if (!preview) return;
    setApplying(true);
    setError('');
    try {
      await recordings.apply(serverId, {
        routes: preview.routes,
        resources: preview.resources,
        target,
        name: target === 'new' ? newName : undefined,
        port: target === 'new' ? newPort : undefined,
      });
      qc.invalidateQueries({ queryKey: ['servers'] });
      qc.invalidateQueries({ queryKey: ['server', serverId] });
      setPreview(null);
      setShowNewForm(false);
    } catch (err) {
      setError((err as Error).message);
    }
    setApplying(false);
  }

  if (loading) return <div className="text-sm text-zinc-500 text-center py-8">Loading recordings...</div>;

  if (items.length === 0 && !preview) {
    return (
      <div className="text-center py-12 space-y-3">
        <div className="text-zinc-500 text-sm">No recordings yet.</div>
        <p className="text-xs text-zinc-600 max-w-md mx-auto">
          Set a <span className="font-mono text-zinc-400">Proxy Target</span> URL in Settings and start the server.
          Unmatched requests will be forwarded to the real API and recorded here.
        </p>
      </div>
    );
  }

  // ── Preview mode ──────────────────────────────

  if (preview) {
    const routeCount = preview.routes.length;
    const resourceCount = preview.resources.length;

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Generated from {items.length} recordings</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {routeCount} route{routeCount !== 1 ? 's' : ''} + {resourceCount} resource{resourceCount !== 1 ? 's' : ''}
              {resourceCount > 0 && ' (each with full CRUD)'}
            </p>
          </div>
          <button
            onClick={() => setPreview(null)}
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            &larr; Back
          </button>
        </div>

        {/* Routes preview */}
        {routeCount > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h4 className="text-xs font-medium text-zinc-400 mb-3">Routes ({routeCount})</h4>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {preview.routes.map((r, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5">
                  <span className={cn('px-2 py-0.5 rounded text-[10px] font-mono font-bold', METHOD_BG[r.config.method ?? 'GET'])}>
                    {(r.config.method ?? 'GET').padEnd(6)}
                  </span>
                  <span className="font-mono text-xs text-zinc-300">{r.config.path}</span>
                  <span className="text-[10px] text-zinc-600 ml-auto">{r.config.status ?? 200}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resources preview */}
        {resourceCount > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <h4 className="text-xs font-medium text-zinc-400 mb-3">Resources ({resourceCount})</h4>
            <div className="space-y-2">
              {preview.resources.map((r) => (
                <div key={r.name} className="flex items-center justify-between py-2 border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium text-pink-400">{r.name}</span>
                    <span className="text-xs text-zinc-500 font-mono">{r.config.basePath}</span>
                  </div>
                  <span className="text-xs text-zinc-500">{r.config.count ?? 5} items</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Apply actions */}
        {!showNewForm ? (
          <div className="flex gap-2">
            <button
              onClick={() => handleApply('same')}
              disabled={applying}
              className="flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              {applying ? 'Applying...' : 'Add to this server'}
            </button>
            <button
              onClick={() => setShowNewForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Server className="w-4 h-4" />
              Create new server
            </button>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
            <h4 className="text-xs font-medium text-zinc-400">New server details</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Name</label>
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm focus:outline-none focus:border-pink-500"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Port</label>
                <input
                  type="number"
                  value={newPort}
                  onChange={e => setNewPort(parseInt(e.target.value) || 3001)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-pink-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleApply('new')}
                disabled={applying}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Check className="w-4 h-4" />
                {applying ? 'Creating...' : 'Create server'}
              </button>
              <button
                onClick={() => setShowNewForm(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Recording list mode ───────────────────────

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-400">{items.length} recording{items.length !== 1 ? 's' : ''}</span>
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-pink-400 hover:text-pink-300 bg-pink-400/10 hover:bg-pink-400/20 rounded-md transition-colors font-medium"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generating ? 'Analysing...' : 'Generate Routes'}
          </button>
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-md transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={handleClear} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 bg-zinc-800 rounded-md transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Clear All
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <select
          value={methodFilter}
          onChange={e => setMethodFilter(e.target.value)}
          className="px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-300 focus:outline-none focus:border-pink-500 appearance-none cursor-pointer"
        >
          {METHODS.map(m => (
            <option key={m} value={m}>{m === 'ALL' ? 'All methods' : m}</option>
          ))}
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
          <input
            value={pathSearch}
            onChange={e => setPathSearch(e.target.value)}
            placeholder="Filter by path..."
            className="w-full pl-8 pr-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-pink-500"
          />
        </div>
        {(methodFilter !== 'ALL' || pathSearch) && (
          <span className="text-xs text-zinc-500">{filtered.length} match{filtered.length !== 1 ? 'es' : ''}</span>
        )}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* List */}
      <div className="space-y-1">
        {filtered.map((rec, idx) => {
          // Find the original index in items for promoting
          const originalIdx = items.indexOf(rec);
          const isExpanded = expanded === originalIdx;
          const authenticated = hasAuth(rec);

          return (
            <div key={originalIdx} className="border border-zinc-800 rounded-lg overflow-hidden">
              <button
                onClick={() => { setExpanded(isExpanded ? null : originalIdx); setDetailTab('response'); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-800/50 transition-colors"
              >
                <span className={cn('font-mono text-xs font-bold w-14', METHOD_COLORS[rec.method] ?? 'text-zinc-400')}>
                  {rec.method}
                </span>
                <span className="font-mono text-sm text-zinc-300 flex-1 truncate">{rec.path}</span>
                {authenticated && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-400 text-[10px] font-medium">
                    <Lock className="w-2.5 h-2.5" />
                    Auth
                  </span>
                )}
                <span className={cn(
                  'text-xs font-mono',
                  rec.status < 300 ? 'text-emerald-400' : rec.status < 400 ? 'text-amber-400' : 'text-red-400',
                )}>
                  {rec.status}
                </span>
                <span className="text-xs text-zinc-600">{new Date(rec.timestamp).toLocaleTimeString()}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handlePromote(originalIdx); }}
                  title="Save as route"
                  className="p-1 text-zinc-500 hover:text-pink-400 rounded transition-colors"
                >
                  <ArrowUpFromLine className="w-3.5 h-3.5" />
                </button>
              </button>

              {isExpanded && (
                <div className="border-t border-zinc-800 bg-zinc-900/50">
                  {/* Request / Response tabs */}
                  <div className="flex border-b border-zinc-800">
                    <button
                      onClick={() => setDetailTab('request')}
                      className={cn(
                        'px-4 py-2 text-xs font-medium transition-colors',
                        detailTab === 'request'
                          ? 'text-pink-400 border-b-2 border-pink-400'
                          : 'text-zinc-500 hover:text-zinc-300',
                      )}
                    >
                      Request
                    </button>
                    <button
                      onClick={() => setDetailTab('response')}
                      className={cn(
                        'px-4 py-2 text-xs font-medium transition-colors',
                        detailTab === 'response'
                          ? 'text-pink-400 border-b-2 border-pink-400'
                          : 'text-zinc-500 hover:text-zinc-300',
                      )}
                    >
                      Response
                    </button>
                  </div>

                  <div className="px-4 py-3">
                    {detailTab === 'request' ? (
                      <RequestDetail rec={rec} />
                    ) : (
                      <ResponseDetail rec={rec} />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Detail sub-components ─────────────────────────

function RequestDetail({ rec }: { rec: RecordedResponse }) {
  const headers = rec.requestHeaders ?? {};
  const headerEntries = Object.entries(headers);

  if (headerEntries.length === 0 && !rec.requestBody) {
    return <div className="text-xs text-zinc-600">No request data recorded.</div>;
  }

  return (
    <div className="space-y-3">
      {headerEntries.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Request Headers</div>
          <pre className="text-xs font-mono text-zinc-500 overflow-auto max-h-32 bg-zinc-900 rounded p-2">
            {headerEntries.map(([k, v]) => {
              const isAuth = AUTH_HEADERS.has(k.toLowerCase());
              if (isAuth) {
                // Mask the value, show only first 12 chars
                const masked = v.length > 12 ? v.slice(0, 12) + '...' : v;
                return `${k}: ${masked}  [AUTH]`;
              }
              return `${k}: ${v}`;
            }).join('\n')}
          </pre>
        </div>
      )}
      {rec.requestBody && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Request Body</div>
          <pre className="text-xs font-mono text-zinc-300 overflow-auto max-h-64 bg-zinc-900 rounded p-2">
            {tryFormatJson(rec.requestBody)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ResponseDetail({ rec }: { rec: RecordedResponse }) {
  return (
    <div className="space-y-3">
      {rec.responseHeaders && Object.keys(rec.responseHeaders).length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Response Headers</div>
          <pre className="text-xs font-mono text-zinc-500 overflow-auto max-h-24">
            {Object.entries(rec.responseHeaders).map(([k, v]) => `${k}: ${v}`).join('\n')}
          </pre>
        </div>
      )}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Response Body</div>
        <pre className="text-xs font-mono text-zinc-300 overflow-auto max-h-64 bg-zinc-900 rounded p-2">
          {rec.body ? tryFormatJson(rec.body) : '(empty)'}
        </pre>
      </div>
    </div>
  );
}

function tryFormatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}
