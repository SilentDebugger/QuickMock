import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const METHOD_COLORS: Record<string, string> = {
  GET:     'text-emerald-400',
  POST:    'text-blue-400',
  PUT:     'text-amber-400',
  PATCH:   'text-violet-400',
  DELETE:  'text-red-400',
  OPTIONS: 'text-zinc-500',
  HEAD:    'text-zinc-500',
};

export const METHOD_BG: Record<string, string> = {
  GET:     'bg-emerald-400/10 text-emerald-400',
  POST:    'bg-blue-400/10 text-blue-400',
  PUT:     'bg-amber-400/10 text-amber-400',
  PATCH:   'bg-violet-400/10 text-violet-400',
  DELETE:  'bg-red-400/10 text-red-400',
};

export function statusColor(status: number): string {
  if (status < 300) return 'text-emerald-400';
  if (status < 400) return 'text-amber-400';
  return 'text-red-400';
}
