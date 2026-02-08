import { useState, useEffect, useCallback } from 'react';
import { Trash2, ArrowUpFromLine, RefreshCw } from 'lucide-react';
import { recordings } from '../lib/api';
import type { RecordedResponse } from '../lib/types';
import { cn } from '../lib/utils';

const METHOD_COLORS: Record<string, string> = {
  GET:    'text-emerald-400',
  POST:   'text-blue-400',
  PUT:    'text-amber-400',
  PATCH:  'text-violet-400',
  DELETE: 'text-red-400',
};

export default function RecordingsViewer({ serverId }: { serverId: string }) {
  const [items, setItems] = useState<RecordedResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    recordings.list(serverId)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [serverId]);

  useEffect(load, [load]);

  async function handleClear() {
    await recordings.clear(serverId);
    setItems([]);
  }

  async function handlePromote(idx: number) {
    await recordings.promote(serverId, idx);
    load(); // refresh after promoting
  }

  if (loading) return <div className="text-sm text-zinc-500 text-center py-8">Loading recordings...</div>;

  if (items.length === 0) {
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

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-400">{items.length} recording{items.length !== 1 ? 's' : ''}</span>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-md transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button onClick={handleClear} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 bg-zinc-800 rounded-md transition-colors">
            <Trash2 className="w-3.5 h-3.5" /> Clear All
          </button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-1">
        {items.map((rec, idx) => (
          <div key={idx} className="border border-zinc-800 rounded-lg overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === idx ? null : idx)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-zinc-800/50 transition-colors"
            >
              <span className={cn('font-mono text-xs font-bold w-14', METHOD_COLORS[rec.method] ?? 'text-zinc-400')}>
                {rec.method}
              </span>
              <span className="font-mono text-sm text-zinc-300 flex-1 truncate">{rec.path}</span>
              <span className={cn(
                'text-xs font-mono',
                rec.status < 300 ? 'text-emerald-400' : rec.status < 400 ? 'text-amber-400' : 'text-red-400',
              )}>
                {rec.status}
              </span>
              <span className="text-xs text-zinc-600">{new Date(rec.timestamp).toLocaleTimeString()}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handlePromote(idx); }}
                title="Save as route"
                className="p-1 text-zinc-500 hover:text-pink-400 rounded transition-colors"
              >
                <ArrowUpFromLine className="w-3.5 h-3.5" />
              </button>
            </button>

            {expanded === idx && (
              <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900/50">
                {rec.responseHeaders && Object.keys(rec.responseHeaders).length > 0 && (
                  <div className="mb-3">
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
            )}
          </div>
        ))}
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
