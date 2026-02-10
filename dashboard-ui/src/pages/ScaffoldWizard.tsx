import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowRight, Lightbulb } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { servers } from '../lib/api';
import { parseScaffold, type ScaffoldResource } from '../lib/scaffold';
import { cn } from '../lib/utils';

const PLACEHOLDER = `users
  name, email, avatar, role

posts (20)
  title, body, publishedAt:date
  authorId -> users

comments
  text
  postId -> posts
  userId -> users`;

const EXAMPLE = PLACEHOLDER;

const FAKER_COLORS: Record<string, string> = {
  'faker.name':      'text-emerald-400',
  'faker.firstName': 'text-emerald-400',
  'faker.lastName':  'text-emerald-400',
  'faker.email':     'text-blue-400',
  'faker.phone':     'text-blue-400',
  'faker.avatar':    'text-violet-400',
  'faker.url':       'text-violet-400',
  'faker.title':     'text-amber-400',
  'faker.lorem':     'text-zinc-400',
  'faker.paragraph': 'text-zinc-400',
  'faker.slug':      'text-zinc-500',
  'faker.number':    'text-cyan-400',
  'faker.boolean':   'text-pink-400',
  'faker.date':      'text-orange-400',
  'faker.timestamp': 'text-orange-400',
  'faker.id':        'text-zinc-500',
  'faker.color':     'text-rose-400',
  'faker.ip':        'text-zinc-500',
  'faker.company':   'text-amber-400',
};

function fakerLabel(faker: string): string {
  return faker.replace('faker.', '');
}

export default function ScaffoldWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const [serverName, setServerName] = useState('');
  const [port, setPort] = useState(3001);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const parsed = useMemo(() => parseScaffold(input), [input]);
  const hasResources = parsed.resources.length > 0;

  const handleCreate = async () => {
    if (!hasResources) return;
    setLoading(true);
    setError('');
    try {
      const config = await servers.create({
        name: serverName || `${parsed.resources[0].name}-api`,
        port,
        resources: parsed.configs,
      });
      qc.invalidateQueries({ queryKey: ['servers'] });
      navigate(`/servers/${config.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
    setLoading(false);
  };

  const loadExample = () => {
    setInput(EXAMPLE);
    if (!serverName) setServerName('blog-api');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800">
        <h1 className="text-lg font-semibold">Quick Start</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Describe your data model and get a working API in seconds.
        </p>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
          {/* Left: input */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-wider text-zinc-500">Data Model</label>
              <button onClick={loadExample} className="text-[10px] text-pink-400/70 hover:text-pink-400 transition-colors">
                Load example
              </button>
            </div>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={PLACEHOLDER}
              rows={18}
              spellCheck={false}
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-sm font-mono resize-y focus:outline-none focus:border-pink-500 placeholder:text-zinc-700"
            />

            {/* Syntax cheat sheet */}
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb className="w-3 h-3 text-amber-400/70" />
                <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Syntax</span>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                <span className="text-zinc-500">resourceName</span>
                <span className="text-zinc-600">define a resource</span>
                <span className="text-zinc-500">resourceName (20)</span>
                <span className="text-zinc-600">with 20 seed items</span>
                <span className="text-zinc-500">&nbsp;&nbsp;field1, field2</span>
                <span className="text-zinc-600">auto-detect type from name</span>
                <span className="text-zinc-500">&nbsp;&nbsp;price:number</span>
                <span className="text-zinc-600">explicit type hint</span>
                <span className="text-zinc-500">&nbsp;&nbsp;authorId -&gt; users</span>
                <span className="text-zinc-600">foreign key relation</span>
              </div>
            </div>
          </div>

          {/* Right: preview */}
          <div className="space-y-3">
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 block">
              Preview {hasResources && `(${parsed.resources.length} resources)`}
            </label>

            {!hasResources ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
                <p className="text-sm text-zinc-600">Start typing to see a live preview of your API.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {parsed.resources.map(res => (
                  <ResourceCard key={res.name} resource={res} allNames={parsed.resources.map(r => r.name)} />
                ))}

                {/* Endpoint summary */}
                <div className="text-xs text-zinc-600 pt-1">
                  Each resource generates GET, POST, PUT, PATCH, DELETE endpoints automatically.
                  Total: {parsed.resources.length * 6} endpoints.
                </div>
              </div>
            )}

            {/* Create section */}
            {hasResources && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Server Name</label>
                    <input
                      value={serverName}
                      onChange={e => setServerName(e.target.value)}
                      placeholder={`${parsed.resources[0].name}-api`}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm focus:outline-none focus:border-pink-500 placeholder:text-zinc-600"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Port</label>
                    <input
                      type="number"
                      value={port}
                      onChange={e => setPort(parseInt(e.target.value) || 3001)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-pink-500"
                    />
                  </div>
                </div>

                {error && <p className="text-sm text-red-400">{error}</p>}

                <button
                  onClick={handleCreate}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {loading ? (
                    'Creating...'
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Create Mock Server
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Resource preview card ──────────────────────────

function ResourceCard({ resource, allNames }: { resource: ScaffoldResource; allNames: string[] }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-pink-400">{resource.name}</span>
          <span className="text-xs text-zinc-600 font-mono">{resource.basePath}</span>
        </div>
        <span className="text-[10px] text-zinc-600">{resource.count} items</span>
      </div>

      <div className="flex items-center gap-1 mb-2.5">
        <span className="text-[10px] text-zinc-600 font-mono">id</span>
        <span className="text-[10px] text-zinc-700">: uuid</span>
      </div>

      <div className="space-y-1">
        {resource.fields.map(field => (
          <div key={field.name} className="flex items-center gap-2 text-[11px] font-mono">
            <span className="text-zinc-300 min-w-0">{field.name}</span>
            {field.relation ? (
              <span className="flex items-center gap-1">
                <ArrowRight className="w-2.5 h-2.5 text-zinc-600" />
                <span className={cn(
                  'text-[10px]',
                  allNames.includes(field.relation) ? 'text-pink-400/70' : 'text-red-400/70',
                )}>
                  {field.relation}
                  {!allNames.includes(field.relation) && ' ?'}
                </span>
              </span>
            ) : (
              <span className={cn('text-[10px]', FAKER_COLORS[field.faker] ?? 'text-zinc-500')}>
                {fakerLabel(field.faker)}
                {field.typeHint && <span className="text-zinc-700 ml-1">(:{field.typeHint})</span>}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
