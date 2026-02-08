import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Play, Square, Settings, ArrowLeft, Save } from 'lucide-react';
import { useServer, useStartServer, useStopServer, useUpdateServer } from '../hooks/useServers';
import { cn } from '../lib/utils';
import RouteEditor from '../components/RouteEditor';
import ResourceEditor from '../components/ResourceEditor';
import ProfileManager from '../components/ProfileManager';
import LogViewer from '../components/LogViewer';
import TryItPanel from '../components/TryItPanel';
import DocsViewer from '../components/DocsViewer';
import RecordingsViewer from '../components/RecordingsViewer';

const TABS = ['Routes', 'Resources', 'Profiles', 'Try It', 'Logs', 'Docs', 'Recordings', 'Settings'] as const;
type Tab = (typeof TABS)[number];

export default function ServerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useServer(id!);
  const startServer = useStartServer();
  const stopServer = useStopServer();
  const updateServer = useUpdateServer();
  const [tab, setTab] = useState<Tab>('Routes');

  if (isLoading) return <div className="p-6 text-zinc-500">Loading...</div>;
  if (!data) return <div className="p-6 text-zinc-500">Server not found</div>;

  const { config, running } = data;
  const baseUrl = `http://${config.host}:${config.port}`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-1 text-zinc-500 hover:text-zinc-300 rounded">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className={cn('w-2.5 h-2.5 rounded-full', running ? 'bg-emerald-400' : 'bg-zinc-600')} />
            <h1 className="text-lg font-semibold">{config.name}</h1>
            <span className="text-sm text-zinc-500 font-mono">:{config.port}</span>
          </div>
          <div className="flex items-center gap-2">
            {running ? (
              <button
                onClick={() => stopServer.mutate(config.id)}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-sm rounded-md transition-colors"
              >
                <Square className="w-3.5 h-3.5" /> Stop
              </button>
            ) : (
              <button
                onClick={() => startServer.mutate(config.id)}
                className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-sm rounded-md transition-colors"
              >
                <Play className="w-3.5 h-3.5" /> Start
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md transition-colors',
                tab === t ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50',
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'Routes' && <RouteEditor serverId={id!} routeList={config.routes ?? []} proxyTarget={config.proxyTarget} running={running} />}
        {tab === 'Resources' && <ResourceEditor serverId={id!} resourceMap={config.resources ?? {}} proxyTarget={config.proxyTarget} running={running} />}
        {tab === 'Profiles' && <ProfileManager serverId={id!} profileMap={config.profiles ?? {}} activeProfile={config.activeProfile} />}
        {tab === 'Try It' && <TryItPanel defaultMethod="GET" defaultUrl={`${baseUrl}/`} baseUrl="" />}
        {tab === 'Logs' && (running
          ? <LogViewer url={`/__api/servers/${id}/log`} title={`${config.name} Log`} />
          : <div className="text-sm text-zinc-500 text-center py-8">Start the server to see live logs.</div>
        )}
        {tab === 'Docs' && <DocsViewer serverId={id!} serverName={config.name} />}
        {tab === 'Recordings' && <RecordingsViewer serverId={id!} />}
        {tab === 'Settings' && <ServerSettings config={config} onSave={(data) => updateServer.mutate({ id: id!, data })} />}
      </div>
    </div>
  );
}

function ServerSettings({ config, onSave }: { config: import('../lib/types').MockServerConfig; onSave: (data: Partial<import('../lib/types').MockServerConfig>) => void }) {
  const [name, setName] = useState(config.name);
  const [description, setDescription] = useState(config.description ?? '');
  const [port, setPort] = useState(config.port);
  const [host, setHost] = useState(config.host);
  const [cors, setCors] = useState(config.cors);
  const [delay, setDelay] = useState(config.delay);
  const [proxyTarget, setProxyTarget] = useState(config.proxyTarget ?? '');

  return (
    <div className="max-w-lg space-y-4">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Name</label>
        <input value={name} onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm focus:outline-none focus:border-pink-500" />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm focus:outline-none focus:border-pink-500" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Port</label>
          <input type="number" value={port} onChange={e => setPort(parseInt(e.target.value) || 3001)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-pink-500" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Host</label>
          <input value={host} onChange={e => setHost(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-pink-500" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Global Delay (ms)</label>
          <input type="number" value={delay} onChange={e => setDelay(parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-pink-500" />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer select-none">
            <input type="checkbox" checked={cors} onChange={e => setCors(e.target.checked)} className="rounded" />
            Enable CORS
          </label>
        </div>
      </div>

      {/* Proxy */}
      <div>
        <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Proxy Target</label>
        <input
          value={proxyTarget}
          onChange={e => setProxyTarget(e.target.value)}
          placeholder="https://api.example.com/v1"
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-pink-500 placeholder:text-zinc-600"
        />
        <p className="text-[10px] text-zinc-600 mt-1">When set, unmatched requests are proxied to this URL and recorded.</p>
      </div>

      <button
        onClick={() => onSave({ name, description, port, host, cors, delay, proxyTarget: proxyTarget || undefined })}
        className="flex items-center gap-2 px-4 py-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-medium rounded-md transition-colors"
      >
        <Save className="w-4 h-4" /> Save Settings
      </button>
    </div>
  );
}
