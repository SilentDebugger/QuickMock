import { useState, useMemo } from 'react';
import { Plus, Trash2, Save, ArrowUpRight, GitBranch, List, Zap } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { routes, overrides } from '../lib/api';
import { cn, METHOD_BG } from '../lib/utils';
import FlowEditor from './FlowEditor';
import type { RouteConfig, SequenceStep, RouteRule, RuntimeOverride } from '../lib/types';

type ResponseMode = 'single' | 'sequence' | 'rules';

function getResponseMode(route: Partial<RouteConfig>): ResponseMode {
  if (route.rules && route.rules.length > 0) return 'rules';
  if (route.sequence && route.sequence.length > 0) return 'sequence';
  return 'single';
}

function modeLabel(route: RouteConfig): string | null {
  if (route.rules && route.rules.length > 0) return `${route.rules.length} rules`;
  if (route.sequence && route.sequence.length > 0) return `${route.sequence.length} steps`;
  return null;
}

// ── Main component ────────────────────────────────

interface Props {
  serverId: string;
  routeList: RouteConfig[];
  proxyTarget?: string;
  running?: boolean;
  routeOverrides?: Record<number, RuntimeOverride>;
}

export default function RouteEditor({ serverId, routeList, proxyTarget, running, routeOverrides }: Props) {
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

  // Initialize passthrough state from server's runtime overrides
  const serverPassthroughs = useMemo(() => {
    const map: Record<number, boolean> = {};
    if (routeOverrides) {
      for (const [idx, ov] of Object.entries(routeOverrides)) {
        if (ov.passthrough) map[Number(idx)] = true;
      }
    }
    return map;
  }, [routeOverrides]);

  const [localOverrides, setLocalOverrides] = useState<Record<number, boolean>>({});
  // Merge: server state as base, local toggles on top
  const passthroughs = useMemo(() => ({ ...serverPassthroughs, ...localOverrides }), [serverPassthroughs, localOverrides]);

  const togglePassthrough = async (idx: number) => {
    const next = !passthroughs[idx];
    setLocalOverrides(prev => ({ ...prev, [idx]: next }));
    try {
      await overrides.patchRoute(serverId, idx, { passthrough: next });
    } catch {
      setLocalOverrides(prev => ({ ...prev, [idx]: !next }));
    }
  };

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
                {modeLabel(route) && (
                  <span className="flex items-center gap-1 text-xs text-pink-400/80">
                    {route.sequence ? <List className="w-3 h-3" /> : <GitBranch className="w-3 h-3" />}
                    {modeLabel(route)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {proxyTarget && running && (
                  <button
                    onClick={() => togglePassthrough(idx)}
                    title={passthroughs[idx] ? 'Proxying to real API — click to mock' : 'Click to proxy to real API'}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-colors',
                      passthroughs[idx]
                        ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
                    )}
                  >
                    <ArrowUpRight className="w-3 h-3" />
                    {passthroughs[idx] ? 'PROXY' : 'Proxy'}
                  </button>
                )}
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

// ── Route form ─────────────────────────────────────

const INPUT = 'px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-pink-500';
const LABEL = 'text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block';

function RouteForm({
  form, setForm, onSave, onCancel,
}: {
  form: Partial<RouteConfig>;
  setForm: (f: Partial<RouteConfig>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<ResponseMode>(getResponseMode(form));
  const [responseText, setResponseText] = useState(form.response ? JSON.stringify(form.response, null, 2) : '');

  const switchMode = (next: ResponseMode) => {
    setMode(next);
    if (next === 'single') {
      setForm({ ...form, sequence: undefined, rules: undefined });
    } else if (next === 'sequence') {
      setForm({
        ...form, response: undefined, responses: undefined, rules: undefined,
        sequence: form.sequence?.length ? form.sequence : [{ status: form.status ?? 200, response: form.response ?? {} }],
      });
    } else {
      setForm({
        ...form, response: undefined, responses: undefined, sequence: undefined,
        rules: form.rules?.length ? form.rules : [{ status: form.status ?? 200, response: form.response ?? {} }],
      });
    }
  };

  return (
    <div className="space-y-3">
      {/* Method + Path + Error */}
      <div className="grid grid-cols-[100px_1fr_80px] gap-2">
        <select value={form.method ?? 'GET'} onChange={e => setForm({ ...form, method: e.target.value })} className={INPUT}>
          {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
        </select>
        <input value={form.path ?? ''} onChange={e => setForm({ ...form, path: e.target.value })} placeholder="/api/endpoint" className={INPUT} />
        <input
          type="number"
          value={form.error ? Math.round(form.error * 100) : ''}
          onChange={e => setForm({ ...form, error: parseInt(e.target.value) ? parseInt(e.target.value) / 100 : undefined })}
          placeholder="Err%"
          className={INPUT}
        />
      </div>

      {/* Response mode selector */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 mr-2">Response</span>
        {(['single', 'sequence', 'rules'] as const).map(m => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-colors',
              mode === m
                ? 'bg-pink-500/15 text-pink-400 font-medium'
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800',
            )}
          >
            {m === 'single' && <Zap className="w-3 h-3" />}
            {m === 'sequence' && <List className="w-3 h-3" />}
            {m === 'rules' && <GitBranch className="w-3 h-3" />}
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Mode-specific content */}
      {mode === 'single' && (
        <SingleMode form={form} setForm={setForm} responseText={responseText} setResponseText={setResponseText} />
      )}
      {mode === 'sequence' && (
        <SequenceMode steps={form.sequence ?? []} onChange={steps => setForm({ ...form, sequence: steps })} />
      )}
      {mode === 'rules' && (
        <RulesMode rules={form.rules ?? []} onChange={rules => setForm({ ...form, rules })} />
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={onSave} className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-500 hover:bg-pink-600 text-white text-sm rounded-md">
          <Save className="w-3.5 h-3.5" /> Save
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md">Cancel</button>
      </div>
    </div>
  );
}

// ── Single response mode ───────────────────────────

function SingleMode({
  form, setForm, responseText, setResponseText,
}: {
  form: Partial<RouteConfig>;
  setForm: (f: Partial<RouteConfig>) => void;
  responseText: string;
  setResponseText: (t: string) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={LABEL}>Status</label>
          <input type="number" value={form.status ?? 200} onChange={e => setForm({ ...form, status: parseInt(e.target.value) || 200 })} className={cn(INPUT, 'w-full')} />
        </div>
        <div>
          <label className={LABEL}>Delay (ms)</label>
          <input type="number" value={form.delay ?? ''} onChange={e => setForm({ ...form, delay: parseInt(e.target.value) || undefined })} placeholder="0" className={cn(INPUT, 'w-full')} />
        </div>
      </div>
      <div>
        <label className={LABEL}>Response Body (JSON)</label>
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
    </>
  );
}

// ── Sequence mode ──────────────────────────────────

function SequenceMode({ steps, onChange }: { steps: SequenceStep[]; onChange: (s: SequenceStep[]) => void }) {
  return (
    <FlowEditor
      items={steps}
      onChange={onChange}
      createItem={() => ({ status: 200, response: {} })}
      addLabel="Add Step"
      emptyMessage="Add steps to define a response sequence. Each request advances to the next step."
      itemLabel={(step, idx, total) =>
        step.sticky ? `Step ${idx + 1} (sticky)` : idx === total - 1 ? `Step ${idx + 1} (repeats)` : `Step ${idx + 1}`
      }
      renderItem={(step, _idx, update) => <SequenceStepCard step={step} update={update} />}
    />
  );
}

function SequenceStepCard({ step, update }: { step: SequenceStep; update: (patch: Partial<SequenceStep>) => void }) {
  const [text, setText] = useState(step.response != null ? JSON.stringify(step.response, null, 2) : '');

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <div className="flex-1">
          <label className={LABEL}>Status</label>
          <input type="number" value={step.status ?? 200} onChange={e => update({ status: parseInt(e.target.value) || 200 })} className={cn(INPUT, 'w-full')} />
        </div>
        <div className="flex-1">
          <label className={LABEL}>Delay (ms)</label>
          <input type="number" value={step.delay ?? ''} onChange={e => update({ delay: parseInt(e.target.value) || undefined })} placeholder="0" className={cn(INPUT, 'w-full')} />
        </div>
        <div className="pt-4">
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={step.sticky ?? false}
              onChange={e => update({ sticky: e.target.checked || undefined })}
              className="rounded accent-pink-500"
            />
            Sticky
          </label>
        </div>
      </div>
      <div>
        <label className={LABEL}>Response Body</label>
        <textarea
          value={text}
          onChange={e => {
            setText(e.target.value);
            try { update({ response: JSON.parse(e.target.value) }); } catch { /* skip */ }
          }}
          rows={3}
          spellCheck={false}
          className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-700/50 rounded text-xs font-mono resize-y focus:outline-none focus:border-pink-500"
        />
      </div>
    </div>
  );
}

// ── Rules mode ─────────────────────────────────────

function RulesMode({ rules, onChange }: { rules: RouteRule[]; onChange: (r: RouteRule[]) => void }) {
  return (
    <FlowEditor
      items={rules}
      onChange={onChange}
      createItem={() => ({ when: { 'query.': '' }, status: 200, response: {} })}
      addLabel="Add Rule"
      emptyMessage="Add rules to return different responses based on request data."
      itemLabel={(rule, idx, total) => {
        if (!rule.when || Object.keys(rule.when).length === 0) return 'Default (fallback)';
        const conds = Object.entries(rule.when).map(([k, v]) => `${k}=${v}`).join(', ');
        return `Rule ${idx + 1}: ${conds}`;
      }}
      renderItem={(rule, _idx, update) => <RuleCard rule={rule} update={update} />}
    />
  );
}

function RuleCard({ rule, update }: { rule: RouteRule; update: (patch: Partial<RouteRule>) => void }) {
  const [text, setText] = useState(rule.response != null ? JSON.stringify(rule.response, null, 2) : '');
  const conditions = Object.entries(rule.when ?? {});
  const isDefault = conditions.length === 0;

  const setCondition = (oldKey: string, newKey: string, value: string) => {
    const next = { ...(rule.when ?? {}) };
    if (oldKey !== newKey) delete next[oldKey];
    next[newKey] = value;
    update({ when: next });
  };

  const removeCondition = (key: string) => {
    const next = { ...(rule.when ?? {}) };
    delete next[key];
    update({ when: next });
  };

  const addCondition = () => {
    update({ when: { ...(rule.when ?? {}), '': '' } });
  };

  return (
    <div className="space-y-2">
      {/* Conditions */}
      {!isDefault && (
        <div className="space-y-1">
          <label className={LABEL}>When</label>
          {conditions.map(([key, value], ci) => (
            <div key={ci} className="flex items-center gap-1">
              <input
                value={key}
                onChange={e => setCondition(key, e.target.value, value)}
                placeholder="query.field"
                className={cn(INPUT, 'flex-1 text-xs')}
              />
              <span className="text-[10px] text-zinc-600">=</span>
              <input
                value={value}
                onChange={e => setCondition(key, key, e.target.value)}
                placeholder="value"
                className={cn(INPUT, 'flex-1 text-xs')}
              />
              <button onClick={() => removeCondition(key)} className="p-1 text-zinc-600 hover:text-red-400 rounded transition-colors text-xs">
                &times;
              </button>
            </div>
          ))}
          <button
            onClick={addCondition}
            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            + condition
          </button>
        </div>
      )}
      {isDefault && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-500 italic">Matches all requests (fallback)</span>
          <button
            onClick={addCondition}
            className="text-[10px] text-pink-400/70 hover:text-pink-400 transition-colors"
          >
            + add condition
          </button>
        </div>
      )}

      {/* Status + Delay */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={LABEL}>Status</label>
          <input type="number" value={rule.status ?? 200} onChange={e => update({ status: parseInt(e.target.value) || 200 })} className={cn(INPUT, 'w-full')} />
        </div>
        <div className="flex-1">
          <label className={LABEL}>Delay (ms)</label>
          <input type="number" value={rule.delay ?? ''} onChange={e => update({ delay: parseInt(e.target.value) || undefined })} placeholder="0" className={cn(INPUT, 'w-full')} />
        </div>
      </div>

      {/* Response */}
      <div>
        <label className={LABEL}>Response Body</label>
        <textarea
          value={text}
          onChange={e => {
            setText(e.target.value);
            try { update({ response: JSON.parse(e.target.value) }); } catch { /* skip */ }
          }}
          rows={3}
          spellCheck={false}
          className="w-full px-3 py-2 bg-zinc-900/60 border border-zinc-700/50 rounded text-xs font-mono resize-y focus:outline-none focus:border-pink-500"
        />
      </div>
    </div>
  );
}
