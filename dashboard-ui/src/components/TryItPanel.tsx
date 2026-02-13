import { useState, useEffect, useMemo } from 'react';
import { Send, History, Search, ChevronRight, Lock, Copy, Check } from 'lucide-react';
import { cn, METHOD_COLORS, statusColor } from '../lib/utils';
import { recordings as recordingsApi } from '../lib/api';
import type { RecordedResponse } from '../lib/types';

/** Headers that indicate authentication. */
const AUTH_HEADERS = new Set(['authorization', 'x-api-key', 'cookie']);

interface Props {
  defaultMethod?: string;
  defaultUrl?: string;
  baseUrl?: string;
  serverId?: string;
}

export default function TryItPanel({ defaultMethod = 'GET', defaultUrl = '', baseUrl = '', serverId }: Props) {
  const [method, setMethod] = useState(defaultMethod);
  const [url, setUrl] = useState(defaultUrl);
  const [headers, setHeaders] = useState('');
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<{ status: number; statusText: string; ms: number; body: string; source?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  // Recordings state
  const [recs, setRecs] = useState<RecordedResponse[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Load recordings when serverId is available
  useEffect(() => {
    if (!serverId) return;
    setRecsLoading(true);
    recordingsApi.list(serverId)
      .then(setRecs)
      .catch(() => setRecs([]))
      .finally(() => setRecsLoading(false));
  }, [serverId]);

  // Deduplicate: keep only the latest recording per unique method+path
  const uniqueRecs = useMemo(() => {
    const seen = new Map<string, RecordedResponse>();
    // Iterate newest-first so the Map keeps the most recent entry
    for (let i = recs.length - 1; i >= 0; i--) {
      const r = recs[i];
      const key = `${r.method} ${r.path}`;
      if (!seen.has(key)) seen.set(key, r);
    }
    // Return in reverse-chronological order (newest first)
    return Array.from(seen.values());
  }, [recs]);

  const filteredRecs = useMemo(() => {
    if (!historySearch) return uniqueRecs;
    const q = historySearch.toLowerCase();
    return uniqueRecs.filter(r => r.path.toLowerCase().includes(q) || r.method.toLowerCase().includes(q));
  }, [uniqueRecs, historySearch]);

  const send = async () => {
    if (!url) return;
    setLoading(true);
    const start = performance.now();
    try {
      const opts: RequestInit = { method, headers: {} };
      if (headers.trim()) {
        try { Object.assign(opts.headers!, JSON.parse(headers)); } catch { /* skip */ }
      }
      if (method !== 'GET' && method !== 'DELETE' && body.trim()) {
        opts.body = body;
        (opts.headers as Record<string, string>)['Content-Type'] ??= 'application/json';
      }

      const target = url.startsWith('http') ? url : `${baseUrl}${url}`;
      const res = await fetch(target, opts);
      const ms = Math.round(performance.now() - start);
      const source = res.headers.get('x-quickmock-source') || undefined;
      const text = await res.text();
      let formatted: string;
      try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch { formatted = text; }
      setResponse({ status: res.status, statusText: res.statusText, ms, body: formatted || '(empty)', source });
    } catch (err) {
      setResponse({ status: 0, statusText: 'Error', ms: Math.round(performance.now() - start), body: (err as Error).message });
    }
    setLoading(false);
  };

  const loadRecording = (rec: RecordedResponse) => {
    setMethod(rec.method);
    // Build full URL for the mock server
    const mockUrl = baseUrl ? `${baseUrl}${rec.path}` : (defaultUrl ? `${defaultUrl.replace(/\/+$/, '')}${rec.path}` : rec.path);
    setUrl(mockUrl);
    if (rec.requestHeaders && Object.keys(rec.requestHeaders).length > 0) {
      setHeaders(JSON.stringify(rec.requestHeaders, null, 2));
    } else {
      setHeaders('');
    }
    if (rec.requestBody) {
      try { setBody(JSON.stringify(JSON.parse(rec.requestBody), null, 2)); } catch { setBody(rec.requestBody); }
    } else {
      setBody('');
    }
    setResponse(null);
    setShowHistory(false);
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const hasRecordings = uniqueRecs.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* URL row */}
      <div className="flex gap-2">
        <select
          value={method}
          onChange={e => setMethod(e.target.value)}
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-sm font-mono font-bold text-emerald-400 focus:outline-none focus:border-pink-500"
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="/api/users"
          spellCheck={false}
          className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-pink-500"
        />
        <button
          onClick={send}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-1.5 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
        {hasRecordings && (
          <button
            onClick={() => setShowHistory(!showHistory)}
            title="Load from recordings"
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors border',
              showHistory
                ? 'bg-violet-500/15 text-violet-400 border-violet-500/30'
                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-700 hover:border-zinc-600',
            )}
          >
            <History className="w-3.5 h-3.5" />
            <span className="text-xs">{uniqueRecs.length}</span>
          </button>
        )}
      </div>

      {/* Recordings sidebar panel */}
      {showHistory && (
        <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900">
          <div className="px-3 py-2 border-b border-zinc-800 flex items-center gap-2">
            <History className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="text-xs font-medium text-zinc-300">Captured Requests</span>
            <span className="text-[10px] text-zinc-600 ml-auto">{filteredRecs.length} of {uniqueRecs.length}</span>
          </div>
          <div className="px-3 py-2 border-b border-zinc-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
              <input
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                placeholder="Filter by path or method..."
                className="w-full pl-7 pr-3 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500"
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-zinc-800/50">
            {recsLoading && <div className="px-3 py-4 text-xs text-zinc-500 text-center">Loading...</div>}
            {!recsLoading && filteredRecs.length === 0 && (
              <div className="px-3 py-4 text-xs text-zinc-500 text-center">
                {historySearch ? 'No matches' : 'No recordings'}
              </div>
            )}
            {filteredRecs.map((rec, idx) => {
              const hasAuth = rec.requestHeaders && Object.keys(rec.requestHeaders).some(k => AUTH_HEADERS.has(k.toLowerCase()));
              return (
                <button
                  key={idx}
                  onClick={() => loadRecording(rec)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/70 transition-colors group"
                >
                  <span className={cn('font-mono text-[10px] font-bold w-10 shrink-0', METHOD_COLORS[rec.method] ?? 'text-zinc-400')}>
                    {rec.method}
                  </span>
                  <span className="font-mono text-xs text-zinc-300 truncate flex-1">{rec.path}</span>
                  {hasAuth && <Lock className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
                  <span className={cn(
                    'text-[10px] font-mono shrink-0',
                    rec.status < 300 ? 'text-emerald-400/70' : rec.status < 400 ? 'text-amber-400/70' : 'text-red-400/70',
                  )}>
                    {rec.status}
                  </span>
                  <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 shrink-0 transition-colors" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Headers & body */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500">Headers (JSON)</label>
            {headers.trim() && (
              <button
                onClick={() => copyToClipboard(headers, 'headers')}
                className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
              >
                {copiedField === 'headers' ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
              </button>
            )}
          </div>
          <textarea
            value={headers}
            onChange={e => setHeaders(e.target.value)}
            rows={2}
            spellCheck={false}
            placeholder='{"Authorization": "Bearer ..."}'
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-xs font-mono resize-none focus:outline-none focus:border-pink-500"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500">Body (JSON)</label>
            {body.trim() && (
              <button
                onClick={() => copyToClipboard(body, 'body')}
                className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
              >
                {copiedField === 'body' ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
              </button>
            )}
          </div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={2}
            spellCheck={false}
            placeholder='{"name": "John"}'
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-xs font-mono resize-none focus:outline-none focus:border-pink-500"
          />
        </div>
      </div>

      {/* Response */}
      {response && (
        <div className="border border-zinc-800 rounded-lg overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-2 bg-zinc-800/50 text-xs font-mono">
            <span className={cn('font-bold', statusColor(response.status))}>
              {response.status} {response.statusText}
            </span>
            <span className="text-cyan-400">{response.ms}ms</span>
            {response.source && (
              <span className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-medium uppercase',
                response.source === 'route' ? 'bg-emerald-500/15 text-emerald-400' :
                response.source === 'resource' ? 'bg-blue-500/15 text-blue-400' :
                response.source === 'proxy' ? 'bg-amber-500/15 text-amber-400' :
                'bg-zinc-700 text-zinc-400',
              )}>
                {response.source}
              </span>
            )}
            {response.body && response.body !== '(empty)' && (
              <button
                onClick={() => copyToClipboard(response.body, 'response')}
                className="ml-auto text-zinc-600 hover:text-zinc-400 transition-colors"
                title="Copy response"
              >
                {copiedField === 'response' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
          </div>
          <pre className="px-4 py-3 text-xs font-mono text-zinc-300 overflow-auto max-h-64 whitespace-pre-wrap break-words">
            {response.body}
          </pre>
        </div>
      )}
    </div>
  );
}
