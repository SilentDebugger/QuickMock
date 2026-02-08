import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { servers } from '../lib/api';
import type { MockServerConfig } from '../lib/types';

export function useServers() {
  return useQuery({ queryKey: ['servers'], queryFn: servers.list });
}

export function useServer(id: string) {
  return useQuery({ queryKey: ['servers', id], queryFn: () => servers.get(id), enabled: !!id });
}

export function useCreateServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<MockServerConfig>) => servers.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  });
}

export function useUpdateServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<MockServerConfig> }) => servers.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['servers'] });
      qc.invalidateQueries({ queryKey: ['servers', id] });
    },
  });
}

export function useDeleteServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => servers.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  });
}

export function useStartServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => servers.start(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  });
}

export function useStopServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => servers.stop(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['servers'] }),
  });
}
