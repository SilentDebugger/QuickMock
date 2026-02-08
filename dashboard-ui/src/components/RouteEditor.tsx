import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { routes } from '../lib/api';
import { cn, METHOD_BG } from '../lib/utils';
import type { RouteConfig } from '../lib/types';

interface Props {
  serverId: string;
  routeList: RouteConfig[];
}

export default function RouteEditor({ serverId, routeList }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<Partial<RouteConfig>>({});

  const createRoute = useMutation({
    mutationFn: (route: RouteConfig) => routes.create(serverId, route),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['servers', serverId] }); setEditing(null); },
  });
  const updateRoute = useMutation({
    mutationFn: ({ idx, data }: { idx: number; data: Partial<RouteConfig> }) => routes.update(serverId, idx, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['servers', serverId] }); setEditing(null); },
  });
  const deleteRoute = useMutation({
    mutationFn: (idx: number) => routes.delete(serverId, idx),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers', serverId] }),
  });

  const startEdit = (idx: number) => {
    setEditing(idx);
    setForm({ ...routeList[idx] });
  };

  const startNew = () => {
    setEditing('new');
    setForm({ method: 'GET', path: '/api/', status: 200, response: {} });
  };

  const save = () => {
    if (editing === 'new') {
      createRoute.mutate(form as RouteConfig);
    } else if (typeof editing === 'number') {
      updateRoute.mutate({ idx: editing, data: form });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">{routeList.length} routes</h3>
        <button onClick={startNew} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm rounded-md transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Route
        </button>
      </div>

      {/* Route list */}
      {routeList.map((route, idx) => (
        <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          {editing === idx ? (
            <RouteForm form={form} setForm={setForm} onSave={save} onCancel={() => setEditing(null)} />
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={cn('px-2 py-0.5 rounded text-xs font-mono font-bold', METHOD_BG[route.method ?? 'GET'])}>
                  {route.method ?? 'GET'}
                </span>
                <span className="font-mono text-sm">{route.path}</span>
                <span className="text-xs text-zinc-500">-&gt; {route.status ?? 200}</span>
                {route.delay && <span className="text-xs text-cyan-400">{route.delay}ms</span>}
                {route.error && <span className="text-xs text-amber-400">{Math.round(route.error * 100)}% fail</span>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(idx)} className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded">Edit</button>
                <button onClick={() => deleteRoute.mutate(idx)} className="p-1 text-zinc-500 hover:text-red-400 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* New route form */}
      {editing === 'new' && (
        <div className="bg-zinc-900 border border-pink-500/30 rounded-lg p-4">
          <RouteForm form={form} setForm={setForm} onSave={save} onCancel={() => setEditing(null)} />
        </div>
      )}
    </div>
  );
}

function RouteForm({
  form, setForm, onSave, onCancel,
}: {
  form: Partial<RouteConfig>;
  setForm: (f: Partial<RouteConfig>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [responseText, setResponseText] = useState(form.response ? JSON.stringify(form.response, null, 2) : '');

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[100px_1fr_80px_80px_80px] gap-2">
        <select
          value={form.method ?? 'GET'}
          onChange={e => setForm({ ...form, method: e.target.value })}
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-pink-500"
        >
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
        </select>
        <input
          value={form.path ?? ''}
          onChange={e => setForm({ ...form, path: e.target.value })}
          placeholder="/api/endpoint"
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-pink-500"
        />
        <input
          type="number"
          value={form.status ?? 200}
          onChange={e => setForm({ ...form, status: parseInt(e.target.value) || 200 })}
          placeholder="Status"
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-pink-500"
        />
        <input
          type="number"
          value={form.delay ?? ''}
          onChange={e => setForm({ ...form, delay: parseInt(e.target.value) || undefined })}
          placeholder="Delay"
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-pink-500"
        />
        <input
          type="number"
          value={form.error ? Math.round(form.error * 100) : ''}
          onChange={e => setForm({ ...form, error: parseInt(e.target.value) ? parseInt(e.target.value) / 100 : undefined })}
          placeholder="Err%"
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-pink-500"
        />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Response Body (JSON)</label>
        <textarea
          value={responseText}
          onChange={e => {
            setResponseText(e.target.value);
            try { setForm({ ...form, response: JSON.parse(e.target.value) }); } catch { /* skip */ }
          }}
          rows={4}
          spellCheck={false}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono resize-y focus:outline-none focus:border-pink-500"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onSave} className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-500 hover:bg-pink-600 text-white text-sm rounded-md">
          <Save className="w-3.5 h-3.5" /> Save
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md">Cancel</button>
      </div>
    </div>
  );
}
