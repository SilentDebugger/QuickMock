import { useRef, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useSse } from '../hooks/useSse';
import { cn, METHOD_COLORS, statusColor } from '../lib/utils';

interface Props {
  url: string;
  title?: string;
}

export default function LogViewer({ url, title = 'Live Log' }: Props) {
  const { entries, clear } = useSse(url);
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  return (
    <div className="border-t border-zinc-800 bg-zinc-900 flex flex-col" style={{ height: 220 }}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-500 cursor-pointer select-none">
            <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} className="rounded" />
            Auto-scroll
          </label>
          <button onClick={clear} className="p-1 text-zinc-500 hover:text-zinc-300" title="Clear">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-xs px-1">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-600 text-xs">
            Waiting for requests...
          </div>
        ) : entries.map((e, i) => (
          <div key={i} className="grid grid-cols-[70px_56px_1fr_48px_56px_44px] gap-2 px-3 py-1 hover:bg-zinc-800/50 items-center">
            <span className="text-zinc-600">{new Date(e.timestamp).toLocaleTimeString()}</span>
            <span className={cn('font-bold', METHOD_COLORS[e.method] ?? 'text-zinc-500')}>{e.method}</span>
            <span className="text-zinc-300 truncate">{e.path}</span>
            <span className={cn('text-right font-semibold', statusColor(e.status))}>{e.status}</span>
            <span className="text-right text-cyan-400">{e.ms}ms</span>
            <span className="text-right">
              {e.proxied && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400">PROXY</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
