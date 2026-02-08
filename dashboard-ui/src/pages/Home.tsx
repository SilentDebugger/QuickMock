import { useNavigate } from 'react-router-dom';
import { Plus, Play, Square, Trash2, Server } from 'lucide-react';
import { useServers, useCreateServer, useStartServer, useStopServer, useDeleteServer } from '../hooks/useServers';
import { cn, METHOD_BG } from '../lib/utils';
import LogViewer from '../components/LogViewer';

export default function Home() {
  const navigate = useNavigate();
  const { data: servers, isLoading } = useServers();
  const createServer = useCreateServer();
  const startServer = useStartServer();
  const stopServer = useStopServer();
  const deleteServer = useDeleteServer();

  const handleCreate = async () => {
    const config = await createServer.mutateAsync({
      name: `Mock Server ${(servers?.length ?? 0) + 1}`,
      port: 3001 + (servers?.length ?? 0),
    });
    navigate(`/servers/${config.id}`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Mock Servers</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Create and manage your mock API servers</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Server
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="text-zinc-500 text-sm">Loading...</div>
        ) : !servers || servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Server className="w-12 h-12 text-zinc-700 mb-4" />
            <p className="text-zinc-400 mb-2">No mock servers yet</p>
            <p className="text-sm text-zinc-600 mb-4">Create a server or import from a schema to get started.</p>
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Server
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {servers.map(s => (
              <div
                key={s.config.id}
                onClick={() => navigate(`/servers/${s.config.id}`)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 cursor-pointer hover:border-zinc-700 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'w-2.5 h-2.5 rounded-full',
                      s.running ? 'bg-emerald-400' : 'bg-zinc-600',
                    )} />
                    <h3 className="font-medium truncate">{s.config.name}</h3>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {s.running ? (
                      <button
                        onClick={e => { e.stopPropagation(); stopServer.mutate(s.config.id); }}
                        className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-amber-400"
                        title="Stop"
                      >
                        <Square className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); startServer.mutate(s.config.id); }}
                        className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400"
                        title="Start"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); if (confirm('Delete this server?')) deleteServer.mutate(s.config.id); }}
                      className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {s.config.description && (
                  <p className="text-sm text-zinc-500 mb-3 truncate">{s.config.description}</p>
                )}

                <div className="flex items-center gap-3 text-xs text-zinc-500 font-mono">
                  <span>:{s.port}</span>
                  <span className="text-zinc-700">|</span>
                  <span>{s.routeCount} routes</span>
                  <span className="text-zinc-700">|</span>
                  <span>{s.resourceCount} resources</span>
                </div>

                {s.running && Object.keys(s.resourceItems).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {Object.entries(s.resourceItems).map(([name, count]) => (
                      <span key={name} className={cn('px-2 py-0.5 rounded text-[10px] font-mono', METHOD_BG['GET'])}>
                        {name}: {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log panel */}
      <LogViewer url="/__api/log" title="Global Log" />
    </div>
  );
}
