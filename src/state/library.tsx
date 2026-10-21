import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildMemory, type Memory } from '../lib/memory';
import { isCurrentFormat } from '../lib/utm';
import type {
  CreatorRecord,
  CreatorsResponse,
  LibraryResponse,
  LinkRecord,
  NewCreator,
  NewLink,
  SaveCreatorsResponse,
  SaveResponse,
  UpdateCreatorRequest,
  UpdateRequest,
} from '../lib/types';

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
  /** The creator registry: one Hark creator ID per creator account. */
  creators: CreatorRecord[];
  saveCreators: (creators: NewCreator[], createdBy: string) => Promise<SaveCreatorsResponse>;
  updateCreator: (id: string, patch: UpdateCreatorRequest['patch']) => Promise<CreatorRecord>;
}

const LibraryContext = createContext<Library | null>(null);

async function api<T>(method: string, body?: unknown, path = '/api/links'): Promise<T> {
  const res = await fetch(path, {
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
  const [creators, setCreators] = useState<CreatorRecord[]>([]);
  const inflight = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    inflight.current ??= Promise.all([api<LibraryResponse>('GET'), api<CreatorsResponse>('GET', undefined, '/api/creators')])
      .then(([data, registry]) => {
        setStorage(data.storage);
        setLinks(data.links);
        setCreators(registry.creators);
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

  const mergeCreators = useCallback((incoming: CreatorRecord[], replacedId?: string) => {
    setCreators((prev) => {
      const map = new Map(prev.filter((c) => c.id !== replacedId).map((c) => [c.id, c]));
      incoming.forEach((c) => map.set(c.id, c));
      return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
    });
  }, []);

  const saveCreators = useCallback(
    async (list: NewCreator[], createdBy: string) => {
      const res = await api<SaveCreatorsResponse>('POST', { creators: list, createdBy }, '/api/creators');
      mergeCreators(res.creators);
      return res;
    },
    [mergeCreators],
  );

  const updateCreator = useCallback(
    async (id: string, patch: UpdateCreatorRequest['patch']) => {
      const res = await api<{ creator: CreatorRecord }>('PATCH', { id, patch }, '/api/creators');
      mergeCreators([res.creator], id);
      return res.creator;
    },
    [mergeCreators],
  );

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
      creators,
      saveCreators,
      updateCreator,
    }),
    [storage, error, links, refresh, save, update, remove, creators, saveCreators, updateCreator],
  );
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): Library {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary needs a LibraryProvider');
  return ctx;
}
