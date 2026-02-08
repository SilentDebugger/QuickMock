import { useEffect, useRef, useState, useCallback } from 'react';
import type { LogEntry } from '../lib/types';

export function useSse(url: string, maxEntries = 500) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const sourceRef = useRef<EventSource | null>(null);

  const clear = useCallback(() => setEntries([]), []);

  useEffect(() => {
    const source = new EventSource(url);
    sourceRef.current = source;

    source.addEventListener('message', (e) => {
      const entry = JSON.parse(e.data) as LogEntry;
      setEntries(prev => {
        const next = [...prev, entry];
        return next.length > maxEntries ? next.slice(-maxEntries) : next;
      });
    });

    source.addEventListener('error', () => {
      source.close();
      // Reconnect after delay
      setTimeout(() => {
        if (sourceRef.current === source) {
          sourceRef.current = null;
        }
      }, 2000);
    });

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, [url, maxEntries]);

  return { entries, clear };
}
