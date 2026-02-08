import { useState } from 'react';
import { Plus, Trash2, Check } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { profiles } from '../lib/api';
import { cn } from '../lib/utils';
import type { Profile } from '../lib/types';

interface Props {
  serverId: string;
  profileMap: Record<string, Profile>;
  activeProfile?: string;
}

export default function ProfileManager({ serverId, profileMap, activeProfile }: Props) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  const createProfile = useMutation({
    mutationFn: (name: string) => profiles.create(serverId, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['servers', serverId] }); setShowNew(false); setNewName(''); },
  });
  const deleteProfile = useMutation({
    mutationFn: (name: string) => profiles.delete(serverId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers', serverId] }),
  });
  const activateProfile = useMutation({
    mutationFn: (name: string) => profiles.activate(serverId, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers', serverId] }),
  });

  const entries = Object.entries(profileMap);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">
          {entries.length} profile{entries.length !== 1 ? 's' : ''}
          {activeProfile && <span className="ml-2 text-xs text-emerald-400">(active: {activeProfile})</span>}
        </h3>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm rounded-md transition-colors">
          <Plus className="w-3.5 h-3.5" /> New Profile
        </button>
      </div>

      {showNew && (
        <div className="bg-zinc-900 border border-pink-500/30 rounded-lg p-4 flex items-center gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && newName && createProfile.mutate(newName)}
            placeholder="Profile name (e.g. minimal, full, staging)"
            autoFocus
            className="flex-1 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm font-mono focus:outline-none focus:border-pink-500"
          />
          <button
            onClick={() => newName && createProfile.mutate(newName)}
            className="px-3 py-1.5 bg-pink-500 hover:bg-pink-600 text-white text-sm rounded-md"
          >
            Create
          </button>
          <button onClick={() => { setShowNew(false); setNewName(''); }} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200">
            Cancel
          </button>
        </div>
      )}

      {entries.length === 0 && !showNew ? (
        <div className="text-sm text-zinc-500 py-8 text-center">
          No profiles yet. Create one to save different endpoint configurations.
        </div>
      ) : entries.map(([name, profile]) => (
        <div key={name} className={cn(
          'bg-zinc-900 border rounded-lg p-4',
          activeProfile === name ? 'border-emerald-500/40' : 'border-zinc-800',
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm font-medium">{name}</span>
              {activeProfile === name && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-400/10 text-emerald-400 uppercase">Active</span>
              )}
              <span className="text-xs text-zinc-500">
                {profile.disabledRoutes?.length ?? 0} disabled routes, {profile.disabledResources?.length ?? 0} disabled resources
              </span>
            </div>
            <div className="flex gap-1">
              {activeProfile !== name && (
                <button
                  onClick={() => activateProfile.mutate(name)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-emerald-400 hover:bg-zinc-800 rounded"
                >
                  <Check className="w-3 h-3" /> Activate
                </button>
              )}
              <button onClick={() => deleteProfile.mutate(name)} className="p-1 text-zinc-500 hover:text-red-400 rounded">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {profile.description && <p className="text-xs text-zinc-500 mt-1">{profile.description}</p>}
        </div>
      ))}
    </div>
  );
}
