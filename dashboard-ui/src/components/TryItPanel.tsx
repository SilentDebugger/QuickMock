import { useState } from 'react';
import { Send } from 'lucide-react';
import { cn, METHOD_COLORS, statusColor } from '../lib/utils';

interface Props {
  defaultMethod?: string;
  defaultUrl?: string;
  baseUrl?: string;
}

export default function TryItPanel({ defaultMethod = 'GET', defaultUrl = '', baseUrl = '' }: Props) {
  const [method, setMethod] = useState(defaultMethod);
  const [url, setUrl] = useState(defaultUrl);
  const [headers, setHeaders] = useState('');
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<{ status: number; statusText: string; ms: number; body: string } | null>(null);
  const [loading, setLoading] = useState(false);

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
      const text = await res.text();
      let formatted: string;
      try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch { formatted = text; }
      setResponse({ status: res.status, statusText: res.statusText, ms, body: formatted || '(empty)' });
    } catch (err) {
      setResponse({ status: 0, statusText: 'Error', ms: Math.round(performance.now() - start), body: (err as Error).message });
    }
    setLoading(false);
  };

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
      </div>

      {/* Headers & body */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Headers (JSON)</label>
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
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Body (JSON)</label>
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
          </div>
          <pre className="px-4 py-3 text-xs font-mono text-zinc-300 overflow-auto max-h-64 whitespace-pre-wrap break-words">
            {response.body}
          </pre>
        </div>
      )}
    </div>
  );
}
