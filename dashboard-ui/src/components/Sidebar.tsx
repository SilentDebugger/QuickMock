import { Link, useLocation } from 'react-router-dom';
import { Home, Server, Upload, Wand2 } from 'lucide-react';
import { useServers } from '../hooks/useServers';
import { cn } from '../lib/utils';

export default function Sidebar() {
  const { pathname } = useLocation();
  const { data: servers } = useServers();

  return (
    <aside className="w-60 bg-zinc-900 border-r border-zinc-800 flex flex-col">
      {/* Brand */}
      <div className="px-4 h-14 flex items-center border-b border-zinc-800">
        <Link to="/" className="flex items-center gap-2 font-mono font-bold text-sm">
          <span className="text-pink-400">&#9670;</span>
          <span>quickmock</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-1">
        <Link
          to="/"
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
            pathname === '/' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50',
          )}
        >
          <Home className="w-4 h-4" />
          Dashboard
        </Link>

        <Link
          to="/scaffold"
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
            pathname === '/scaffold' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50',
          )}
        >
          <Wand2 className="w-4 h-4" />
          Quick Start
        </Link>

        <Link
          to="/import"
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
            pathname === '/import' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50',
          )}
        >
          <Upload className="w-4 h-4" />
          Import Schema
        </Link>

        {/* Server list */}
        {servers && servers.length > 0 && (
          <>
            <div className="pt-4 pb-1 px-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Servers
              </span>
            </div>
            {servers.map(s => (
              <Link
                key={s.config.id}
                to={`/servers/${s.config.id}`}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  pathname === `/servers/${s.config.id}`
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50',
                )}
              >
                <Server className="w-4 h-4" />
                <span className="truncate flex-1">{s.config.name}</span>
                <span className={cn(
                  'w-2 h-2 rounded-full',
                  s.running ? 'bg-emerald-400' : 'bg-zinc-600',
                )} />
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-zinc-800">
        <p className="text-[10px] text-zinc-600 font-mono">quickmock v1.0.0</p>
      </div>
    </aside>
  );
}
