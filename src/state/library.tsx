import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildMemory, type Memory } from '../lib/memory';
import { isCurrentFormat } from '../lib/utm';
import type { LibraryResponse, LinkRecord, NewLink, SaveResponse, UpdateRequest } from '../lib/types';

interface Library {
  storage: LibraryResponse['storage'] | 'loading' | 'error';
  error: string | null;
  links: LinkRecord[];
  byUrl: Map<string, LinkRecord>;
  memory: Memory;
  refresh: () => Promise<void>;
  save: (links: NewLink[], batchName?: string) => Promise<SaveResponse>;
  update: (ids: string[], patch: UpdateRequest['patch']) => Promise<void>;
  remove: (ids: string[]) => Promise<void>;
}

const LibraryContext = createContext<Library | null>(null);

async function api<T>(method: string, body?: unknown): Promise<T> {
  const res = await fetch('/api/links', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? `Request failed (${res.status}).`);
  return data as T;
}

const sortNewest = (links: LinkRecord[]) =>
  [...links].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.seq - b.seq);

/** The shared library, loaded once and refreshed when the tab regains focus. */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const [storage, setStorage] = useState<Library['storage']>('loading');
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkRecord[]>([]);
  const inflight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    inflight.current ??= api<LibraryResponse>('GET')
      .then((data) => {
        setStorage(data.storage);
        setLinks(data.links);
        setError(null);
      })
      .catch((err: Error) => {
        setStorage((s) => (s === 'loading' ? 'error' : s));
        setError(err.message);
      })
      .finally(() => {
        inflight.current = null;
      });
    return inflight.current;
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onFocus);
    return () => document.removeEventListener('visibilitychange', onFocus);
  }, [refresh]);

  const merge = useCallback((incoming: LinkRecord[]) => {
    setLinks((prev) => {
      const map = new Map(prev.map((l) => [l.id, l]));
      incoming.forEach((l) => map.set(l.id, l));
      return sortNewest([...map.values()]);
    });
  }, []);

  const save = useCallback(
    async (newLinks: NewLink[], batchName?: string) => {
      const res = await api<SaveResponse>('POST', { links: newLinks, batchName });
      merge([...res.created, ...res.existing]);
      return res;
    },
    [merge],
  );

  const update = useCallback(
    async (ids: string[], patch: UpdateRequest['patch']) => {
      const res = await api<{ updated: LinkRecord[] }>('PATCH', { ids, patch });
      merge(res.updated);
    },
    [merge],
  );

  const remove = useCallback(async (ids: string[]) => {
    const res = await api<{ deleted: string[] }>('DELETE', { ids });
    const gone = new Set(res.deleted);
    setLinks((prev) => prev.filter((l) => !gone.has(l.id)));
  }, []);

  const value = useMemo<Library>(
    () => ({
      storage,
      error,
      links,
      byUrl: new Map(links.map((l) => [l.url, l])),
      // Suggestions only learn from live links that follow the schema, not old-format values.
      memory: buildMemory(links.filter((l) => l.status === 'active' && isCurrentFormat(l))),
      refresh,
      save,
      update,
      remove,
    }),
    [storage, error, links, refresh, save, update, remove],
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): Library {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary needs a LibraryProvider');
  return ctx;
}
