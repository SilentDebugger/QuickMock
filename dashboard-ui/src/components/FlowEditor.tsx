import type { ReactNode } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

interface FlowEditorProps<T> {
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, index: number, update: (patch: Partial<T>) => void) => ReactNode;
  createItem: () => T;
  addLabel?: string;
  emptyMessage?: string;
  itemLabel?: (item: T, index: number, total: number) => string;
  className?: string;
}

export default function FlowEditor<T>({
  items, onChange, renderItem, createItem,
  addLabel = 'Add Step', emptyMessage = 'No steps yet.',
  itemLabel, className,
}: FlowEditorProps<T>) {
  const add    = ()                  => onChange([...items, createItem()]);
  const remove = (idx: number)       => onChange(items.filter((_, i) => i !== idx));
  const move   = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  };
  const update = (idx: number, patch: Partial<T>) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  if (items.length === 0) {
    return (
      <div className={cn('text-center py-5', className)}>
        <p className="text-xs text-zinc-500 mb-3">{emptyMessage}</p>
        <button
          onClick={add}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> {addLabel}
        </button>
      </div>
    );
  }

  return (
    <div className={cn('space-y-0', className)}>
      {items.map((item, idx) => (
        <div key={idx}>
          {/* Card */}
          <div className="relative bg-zinc-800/40 border border-zinc-700/50 rounded-lg">
            {/* Header */}
            <div className="flex items-center justify-between px-3 pt-2 pb-1">
              <span className="text-[10px] font-mono font-medium text-zinc-500">
                {itemLabel?.(item, idx, items.length) ?? `#${idx + 1}`}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  className="p-1 text-zinc-600 hover:text-zinc-300 disabled:opacity-25 disabled:cursor-default rounded transition-colors"
                >
                  <ChevronUp className="w-3 h-3" />
                </button>
                <button
                  onClick={() => move(idx, 1)}
                  disabled={idx === items.length - 1}
                  className="p-1 text-zinc-600 hover:text-zinc-300 disabled:opacity-25 disabled:cursor-default rounded transition-colors"
                >
                  <ChevronDown className="w-3 h-3" />
                </button>
                <button
                  onClick={() => remove(idx)}
                  className="p-1 text-zinc-600 hover:text-red-400 rounded transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
            {/* Content */}
            <div className="px-3 pb-3">
              {renderItem(item, idx, (patch) => update(idx, patch))}
            </div>
          </div>
          {/* Connector */}
          {idx < items.length - 1 && (
            <div className="flex justify-center">
              <div className="w-px h-3 bg-zinc-700/70" />
            </div>
          )}
        </div>
      ))}
      {/* Add button */}
      <div className="pt-2">
        <button
          onClick={add}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-400 hover:text-zinc-200 rounded-md transition-colors"
        >
          <Plus className="w-3 h-3" /> {addLabel}
        </button>
      </div>
    </div>
  );
}
