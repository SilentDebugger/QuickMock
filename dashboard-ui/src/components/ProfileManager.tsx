import { useState, useCallback } from 'react';
import { Plus, Trash2, Check, ChevronDown, ChevronRight, X, Zap } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { profiles } from '../lib/api';
import { cn, METHOD_BG } from '../lib/utils';
import type { Profile, RouteConfig, ResourceConfig } from '../lib/types';

interface Props {
  serverId: string;
  profileMap: Record<string, Profile>;
  activeProfile?: string;
  routes: RouteConfig[];
  resources: Record<string, ResourceConfig>;
}

export default function ProfileManager({ serverId, profileMap, activeProfile, routes, resources }: Props) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['servers'] });
    qc.invalidateQueries({ queryKey: ['server', serverId] });
  };
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const createProfile = useMutation({
    mutationFn: (name: string) => profiles.create(serverId, name, newDesc || undefined),
    onSuccess: () => { invalidate(); setShowNew(false); setNewName(''); setNewDesc(''); },
  });
  const deleteProfile = useMutation({
    mutationFn: (name: string) => profiles.delete(serverId, name),
    onSuccess: invalidate,
  });
  const activateProfile = useMutation({
    mutationFn: (name: string) => profiles.activate(serverId, name),
    onSuccess: invalidate,
  });
  const deactivateProfile = useMutation({
    mutationFn: () => profiles.deactivate(serverId),
    onSuccess: invalidate,
  });
  const updateProfile = useMutation({
    mutationFn: ({ name, data }: { name: string; data: Partial<Profile> }) => profiles.update(serverId, name, data),
    onSuccess: invalidate,
  });

  const entries = Object.entries(profileMap);
  const resourceNames = Object.keys(resources);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">
          {entries.length} profile{entries.length !== 1 ? 's' : ''}
          {activeProfile && <span className="ml-2 text-xs text-emerald-400">(active: {activeProfile})</span>}
        </h3>
        <div className="flex gap-2">
          {activeProfile && (
            <button
              onClick={() => deactivateProfile.mutate()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-amber-400 hover:bg-amber-400/10 rounded-md transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Deactivate
            </button>
          )}
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm rounded-md transition-colors">
            <Plus className="w-3.5 h-3.5" /> New Profile
          </button>
        </div>
      </div>

      {showNew && (
        <div className="bg-zinc-900 border border-pink-500/30 rounded-lg p-4 space-y-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newName && createProfile.mutate(newName)}
            placeholder="Profile name (e.g. happy-path, error-state, minimal)"
            autoFocus
            className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-pink-500"
          />
          <input
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm focus:outline-none focus:border-pink-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => newName && createProfile.mutate(newName)}
              className="px-3 py-1.5 bg-pink-500 hover:bg-pink-600 text-white text-sm rounded-md"
            >
              Create
            </button>
            <button onClick={() => { setShowNew(false); setNewName(''); setNewDesc(''); }} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">
              Cancel
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 && !showNew ? (
        <div className="text-sm text-zinc-500 py-8 text-center">
          No profiles yet. Create one to save different endpoint configurations.
        </div>
      ) : entries.map(([name, profile]) => {
        const isExpanded = expanded === name;
        const isActive = activeProfile === name;
        const disabledRoutesCount = profile.disabledRoutes?.length ?? 0;
        const disabledResourcesCount = profile.disabledResources?.length ?? 0;
        const overrideCount = Object.keys(profile.overrides?.routes ?? {}).length + Object.keys(profile.overrides?.resources ?? {}).length;

        return (
          <div key={name} className={cn(
            'bg-zinc-900 border rounded-lg overflow-hidden',
            isActive ? 'border-emerald-500/40' : 'border-zinc-800',
          )}>
            {/* Profile header */}
            <div className="flex items-center justify-between px-4 py-3">
              <button onClick={() => setExpanded(isExpanded ? null : name)} className="flex items-center gap-3 flex-1 text-left">
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
                <span className="font-mono text-sm font-medium">{name}</span>
                {isActive && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-400/10 text-emerald-400 uppercase">Active</span>
                )}
                <span className="text-xs text-zinc-600">
                  {disabledRoutesCount > 0 && <span className="text-amber-400/70">{disabledRoutesCount} disabled</span>}
                  {disabledRoutesCount > 0 && overrideCount > 0 && <span className="mx-1">&middot;</span>}
                  {overrideCount > 0 && <span className="text-violet-400/70">{overrideCount} override{overrideCount !== 1 ? 's' : ''}</span>}
                </span>
              </button>
              <div className="flex gap-1">
                {!isActive ? (
                  <button
                    onClick={() => activateProfile.mutate(name)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-emerald-400 hover:bg-zinc-800 rounded transition-colors"
                  >
                    <Check className="w-3 h-3" /> Activate
                  </button>
                ) : (
                  <button
                    onClick={() => deactivateProfile.mutate()}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-amber-400 hover:bg-zinc-800 rounded transition-colors"
                  >
                    <X className="w-3 h-3" /> Deactivate
                  </button>
                )}
                <button onClick={() => deleteProfile.mutate(name)} className="p-1 text-zinc-500 hover:text-red-400 rounded transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {profile.description && !isExpanded && (
              <div className="px-4 pb-3 -mt-1">
                <p className="text-xs text-zinc-500">{profile.description}</p>
              </div>
            )}

            {/* Expanded config */}
            {isExpanded && (
              <ProfileConfig
                serverId={serverId}
                name={name}
                profile={profile}
                routes={routes}
                resourceNames={resourceNames}
                onUpdate={(data) => updateProfile.mutate({ name, data })}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Profile Configuration Panel ──────────────────

interface ConfigProps {
  serverId: string;
  name: string;
  profile: Profile;
  routes: RouteConfig[];
  resourceNames: string[];
  onUpdate: (data: Partial<Profile>) => void;
}

function ProfileConfig({ profile, routes, resourceNames, onUpdate }: ConfigProps) {
  const disabledRoutes = new Set(profile.disabledRoutes ?? []);
  const disabledResources = new Set(profile.disabledResources ?? []);
  const routeOverrides = profile.overrides?.routes ?? {};
  const resourceOverrides = profile.overrides?.resources ?? {};

  const toggleRoute = useCallback((idx: number) => {
    const next = new Set(disabledRoutes);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    onUpdate({ disabledRoutes: [...next] });
  }, [disabledRoutes, onUpdate]);

  const toggleResource = useCallback((name: string) => {
    const next = new Set(disabledResources);
    if (next.has(name)) next.delete(name); else next.add(name);
    onUpdate({ disabledResources: [...next] });
  }, [disabledResources, onUpdate]);

  const setRouteOverride = useCallback((idx: number, field: string, value: number | undefined) => {
    const current = routeOverrides[idx] ?? {};
    const updated = { ...current, [field]: value };
    // Clean up undefined values
    if (updated.delay === undefined || updated.delay === 0) delete updated.delay;
    if (updated.error === undefined || updated.error === 0) delete updated.error;
    const next = { ...routeOverrides, [idx]: updated };
    if (Object.keys(updated).length === 0) delete next[idx];
    onUpdate({ overrides: { ...profile.overrides, routes: next } });
  }, [routeOverrides, profile.overrides, onUpdate]);

  const setResourceOverride = useCallback((name: string, field: string, value: number | undefined) => {
    const current = resourceOverrides[name] ?? {};
    const updated = { ...current, [field]: value };
    if (updated.delay === undefined || updated.delay === 0) delete updated.delay;
    if (updated.error === undefined || updated.error === 0) delete updated.error;
    const next = { ...resourceOverrides, [name]: updated };
    if (Object.keys(updated).length === 0) delete next[name];
    onUpdate({ overrides: { ...profile.overrides, resources: next } });
  }, [resourceOverrides, profile.overrides, onUpdate]);

  return (
    <div className="border-t border-zinc-800">
      {/* Description */}
      {profile.description && (
        <div className="px-4 pt-3">
          <p className="text-xs text-zinc-500">{profile.description}</p>
        </div>
      )}

      {/* Routes section */}
      <div className="px-4 py-3">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
          Routes ({routes.length})
        </div>
        {routes.length === 0 ? (
          <p className="text-xs text-zinc-600">No routes configured.</p>
        ) : (
          <div className="space-y-1">
            {routes.map((route, idx) => {
              const disabled = disabledRoutes.has(idx);
              const override = routeOverrides[idx];
              const method = (route.method ?? 'GET').toUpperCase();
              return (
                <RouteToggleRow
                  key={idx}
                  method={method}
                  path={route.path}
                  disabled={disabled}
                  override={override}
                  onToggle={() => toggleRoute(idx)}
                  onDelay={(v) => setRouteOverride(idx, 'delay', v)}
                  onError={(v) => setRouteOverride(idx, 'error', v)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Resources section */}
      <div className="px-4 py-3 border-t border-zinc-800">
        <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
          Resources ({resourceNames.length})
        </div>
        {resourceNames.length === 0 ? (
          <p className="text-xs text-zinc-600">No resources configured.</p>
        ) : (
          <div className="space-y-1">
            {resourceNames.map(name => {
              const disabled = disabledResources.has(name);
              const override = resourceOverrides[name];
              return (
                <ResourceToggleRow
                  key={name}
                  name={name}
                  disabled={disabled}
                  override={override}
                  onToggle={() => toggleResource(name)}
                  onDelay={(v) => setResourceOverride(name, 'delay', v)}
                  onError={(v) => setResourceOverride(name, 'error', v)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Toggle row for a route ───────────────────────

interface RouteToggleRowProps {
  method: string;
  path: string;
  disabled: boolean;
  override?: { delay?: number; error?: number };
  onToggle: () => void;
  onDelay: (v: number | undefined) => void;
  onError: (v: number | undefined) => void;
}

function RouteToggleRow({ method, path, disabled, override, onToggle, onDelay, onError }: RouteToggleRowProps) {
  const [showOverrides, setShowOverrides] = useState(false);
  const hasOverrides = (override?.delay && override.delay > 0) || (override?.error && override.error > 0);

  return (
    <div className={cn('rounded-md transition-colors', disabled ? 'opacity-50' : '')}>
      <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-zinc-800/50 rounded-md">
        {/* Toggle */}
        <button
          onClick={onToggle}
          className={cn(
            'w-8 h-[18px] rounded-full relative transition-colors shrink-0',
            disabled ? 'bg-zinc-700' : 'bg-emerald-500',
          )}
        >
          <span className={cn(
            'absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform',
            disabled ? 'left-[2px]' : 'left-[16px]',
          )} />
        </button>

        <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0', METHOD_BG[method] ?? 'bg-zinc-800 text-zinc-400')}>
          {method}
        </span>
        <span className={cn('font-mono text-xs truncate flex-1', disabled ? 'text-zinc-500 line-through' : 'text-zinc-300')}>
          {path}
        </span>

        {/* Override indicator */}
        {hasOverrides && !showOverrides && (
          <span className="text-[10px] text-violet-400 font-mono">
            {override?.delay ? `${override.delay}ms` : ''}{override?.delay && override?.error ? ' ' : ''}{override?.error ? `${Math.round(override.error * 100)}%err` : ''}
          </span>
        )}

        <button
          onClick={() => setShowOverrides(!showOverrides)}
          className={cn(
            'p-1 rounded transition-colors',
            showOverrides || hasOverrides ? 'text-violet-400 hover:text-violet-300' : 'text-zinc-600 hover:text-zinc-400',
          )}
          title="Override delay & error rate"
        >
          <Zap className="w-3 h-3" />
        </button>
      </div>

      {/* Inline overrides */}
      {showOverrides && (
        <div className="flex items-center gap-3 px-2 pb-2 ml-10">
          <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            Delay
            <input
              type="number"
              min={0}
              value={override?.delay ?? ''}
              onChange={e => onDelay(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="0"
              className="w-16 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300 focus:outline-none focus:border-violet-500"
            />
            <span className="text-zinc-600">ms</span>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            Error
            <input
              type="number"
              min={0}
              max={100}
              value={override?.error ? Math.round(override.error * 100) : ''}
              onChange={e => onError(e.target.value ? parseInt(e.target.value) / 100 : undefined)}
              placeholder="0"
              className="w-16 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300 focus:outline-none focus:border-violet-500"
            />
            <span className="text-zinc-600">%</span>
          </label>
        </div>
      )}
    </div>
  );
}

// ── Toggle row for a resource ────────────────────

interface ResourceToggleRowProps {
  name: string;
  disabled: boolean;
  override?: { delay?: number; error?: number };
  onToggle: () => void;
  onDelay: (v: number | undefined) => void;
  onError: (v: number | undefined) => void;
}

function ResourceToggleRow({ name, disabled, override, onToggle, onDelay, onError }: ResourceToggleRowProps) {
  const [showOverrides, setShowOverrides] = useState(false);
  const hasOverrides = (override?.delay && override.delay > 0) || (override?.error && override.error > 0);

  return (
    <div className={cn('rounded-md transition-colors', disabled ? 'opacity-50' : '')}>
      <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-zinc-800/50 rounded-md">
        <button
          onClick={onToggle}
          className={cn(
            'w-8 h-[18px] rounded-full relative transition-colors shrink-0',
            disabled ? 'bg-zinc-700' : 'bg-emerald-500',
          )}
        >
          <span className={cn(
            'absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform',
            disabled ? 'left-[2px]' : 'left-[16px]',
          )} />
        </button>

        <span className={cn('font-mono text-sm font-medium', disabled ? 'text-zinc-500 line-through' : 'text-pink-400')}>
          {name}
        </span>
        <span className="text-xs text-zinc-600 flex-1">(CRUD)</span>

        {hasOverrides && !showOverrides && (
          <span className="text-[10px] text-violet-400 font-mono">
            {override?.delay ? `${override.delay}ms` : ''}{override?.delay && override?.error ? ' ' : ''}{override?.error ? `${Math.round(override.error * 100)}%err` : ''}
          </span>
        )}

        <button
          onClick={() => setShowOverrides(!showOverrides)}
          className={cn(
            'p-1 rounded transition-colors',
            showOverrides || hasOverrides ? 'text-violet-400 hover:text-violet-300' : 'text-zinc-600 hover:text-zinc-400',
          )}
          title="Override delay & error rate"
        >
          <Zap className="w-3 h-3" />
        </button>
      </div>

      {showOverrides && (
        <div className="flex items-center gap-3 px-2 pb-2 ml-10">
          <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            Delay
            <input
              type="number"
              min={0}
              value={override?.delay ?? ''}
              onChange={e => onDelay(e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="0"
              className="w-16 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300 focus:outline-none focus:border-violet-500"
            />
            <span className="text-zinc-600">ms</span>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-zinc-500">
            Error
            <input
              type="number"
              min={0}
              max={100}
              value={override?.error ? Math.round(override.error * 100) : ''}
              onChange={e => onError(e.target.value ? parseInt(e.target.value) / 100 : undefined)}
              placeholder="0"
              className="w-16 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs font-mono text-zinc-300 focus:outline-none focus:border-violet-500"
            />
            <span className="text-zinc-600">%</span>
          </label>
        </div>
      )}
    </div>
  );
}
