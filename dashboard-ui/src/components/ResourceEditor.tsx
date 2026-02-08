import { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resources } from '../lib/api';
import type { ResourceConfig } from '../lib/types';

interface Props {
  serverId: string;
  resourceMap: Record<string, ResourceConfig>;
}

export default function ResourceEditor({ serverId, resourceMap }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [name, setName] = useState('');
  const [form, setForm] = useState<Partial<ResourceConfig>>({});
  const [seedText, setSeedText] = useState('');

  const create = useMutation({
    mutationFn: ({ name, config }: { name: string; config: ResourceConfig }) => resources.create(serverId, name, config),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['servers', serverId] }); setEditing(null); },
  });
  const update = useMutation({
    mutationFn: ({ name, data }: { name: string; data: Partial<ResourceConfig> }) => resources.update(serverId, name, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['servers', serverId] }); setEditing(null); },
  });
  const remove = useMutation({
    mutationFn: (name: string) => resources.delete(serverId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers', serverId] }),
  });

  const entries = Object.entries(resourceMap);

  const startEdit = (key: string) => {
    setEditing(key);
    setName(key);
    setForm({ ...resourceMap[key] });
    setSeedText(JSON.stringify(resourceMap[key].seed, null, 2));
  };

  const startNew = () => {
    setEditing('new');
    setName('');
    setForm({ basePath: '/api/', count: 5, idField: 'id', seed: { id: '{{faker.id}}', name: '{{faker.name}}' } });
    setSeedText('{\n  "id": "{{faker.id}}",\n  "name": "{{faker.name}}"\n}');
  };

  const save = () => {
    let seed: unknown;
    try { seed = JSON.parse(seedText); } catch { seed = {}; }
    const config: ResourceConfig = { basePath: form.basePath ?? '/api/' + name, seed, count: form.count ?? 5, idField: form.idField ?? 'id' };
    if (form.delay) config.delay = form.delay;
    if (form.error) config.error = form.error;
    if (editing === 'new') {
      create.mutate({ name, config });
    } else if (editing) {
      update.mutate({ name: editing, data: config });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">{entries.length} resources</h3>
        <button onClick={startNew} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm rounded-md transition-colors">
          <Plus className="w-3.5 h-3.5" /> Add Resource
        </button>
      </div>

      {entries.map(([key, config]) => (
        <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
          {editing === key ? (
            <ResourceForm name={name} setName={setName} form={form} setForm={setForm} seedText={seedText} setSeedText={setSeedText} onSave={save} onCancel={() => setEditing(null)} isNew={false} />
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-pink-400/10 text-pink-400">CRUD</span>
                <span className="font-mono text-sm font-medium">{key}</span>
                <span className="text-xs text-zinc-500 font-mono">{config.basePath}</span>
                <span className="text-xs text-zinc-500">{config.count ?? 5} items</span>
                {config.delay && <span className="text-xs text-cyan-400">{config.delay}ms</span>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => startEdit(key)} className="px-2 py-1 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded">Edit</button>
                <button onClick={() => remove.mutate(key)} className="p-1 text-zinc-500 hover:text-red-400 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {editing === 'new' && (
        <div className="bg-zinc-900 border border-pink-500/30 rounded-lg p-4">
          <ResourceForm name={name} setName={setName} form={form} setForm={setForm} seedText={seedText} setSeedText={setSeedText} onSave={save} onCancel={() => setEditing(null)} isNew />
        </div>
      )}
    </div>
  );
}

function ResourceForm({ name, setName, form, setForm, seedText, setSeedText, onSave, onCancel, isNew }: {
  name: string; setName: (n: string) => void;
  form: Partial<ResourceConfig>; setForm: (f: Partial<ResourceConfig>) => void;
  seedText: string; setSeedText: (t: string) => void;
  onSave: () => void; onCancel: () => void; isNew: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_1fr_80px_80px_80px] gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" disabled={!isNew}
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-pink-500 disabled:opacity-50" />
        <input value={form.basePath ?? ''} onChange={e => setForm({ ...form, basePath: e.target.value })} placeholder="/api/items"
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-pink-500" />
        <input type="number" value={form.count ?? 5} onChange={e => setForm({ ...form, count: parseInt(e.target.value) || 5 })} placeholder="Count"
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-pink-500" />
        <input type="number" value={form.delay ?? ''} onChange={e => setForm({ ...form, delay: parseInt(e.target.value) || undefined })} placeholder="Delay"
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-pink-500" />
        <input value={form.idField ?? 'id'} onChange={e => setForm({ ...form, idField: e.target.value })} placeholder="ID field"
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-pink-500" />
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Seed Template (JSON with {`{{faker.*}}`} placeholders)</label>
        <textarea value={seedText} onChange={e => setSeedText(e.target.value)} rows={6} spellCheck={false}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono resize-y focus:outline-none focus:border-pink-500" />
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
