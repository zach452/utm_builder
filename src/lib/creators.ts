import type { CreatorRecord, NewCreator } from './types';
import { normalizeParam, slugify } from './utm';

/**
 * Client-side mirror of the registry's matching in api/creators.ts, so the bulk table can show
 * each row's creator ID before anything is saved. The server has the final say on save.
 */
export const cleanHandle = (h: string): string => h.trim().replace(/^@+/, '').replace(/\.+$/, '').toLowerCase();
const nameKey = (n: string): string => n.trim().replace(/\s+/g, ' ').toLowerCase();
const idNumber = (id: string): number => (/^CT[0-9]{4,}$/.test(id) ? Number(id.slice(2)) : 0);
export const formatCreatorId = (n: number): string => `CT${String(n).padStart(4, '0')}`;

export interface CreatorIndex {
  byHandle: Map<string, CreatorRecord>;
  byAnyHandle: Map<string, CreatorRecord>;
  byName: Map<string, CreatorRecord>;
  byId: Map<string, CreatorRecord>;
  next: number;
}

export function indexCreators(creators: CreatorRecord[]): CreatorIndex {
  const index: CreatorIndex = { byHandle: new Map(), byAnyHandle: new Map(), byName: new Map(), byId: new Map(), next: 1 };
  for (const c of creators) {
    index.byId.set(c.id, c);
    if (c.name) index.byName.set(nameKey(c.name), c);
    for (const [p, h] of Object.entries(c.handles)) {
      index.byHandle.set(`${p}:${h}`, c);
      index.byAnyHandle.set(h, c);
    }
    index.next = Math.max(index.next, idNumber(c.id) + 1);
  }
  return index;
}

export function matchCreator(index: CreatorIndex, input: NewCreator): CreatorRecord | undefined {
  for (const [p, h] of Object.entries(input.handles)) {
    const hit = index.byHandle.get(`${p}:${h}`);
    if (hit) return hit;
  }
  for (const h of Object.values(input.handles)) {
    const hit = index.byAnyHandle.get(h);
    if (hit) return hit;
  }
  if (!Object.keys(input.handles).length && input.name) return index.byName.get(nameKey(input.name));
  return undefined;
}

/** A creator whose handle (on any platform) cleans up to this utm_content value. */
export function creatorForContent(creators: CreatorRecord[], content: string): CreatorRecord | undefined {
  const key = slugify(content);
  if (!key) return undefined;
  return creators.find((c) => Object.values(c.handles).some((h) => slugify(h) === key));
}

export interface RowCreator {
  /** Key shared by rows for the same creator in this paste. */
  group: string;
  id: string;
  isNew: boolean;
  creator?: CreatorRecord;
}

export interface CreatorGroup {
  key: string;
  input: NewCreator;
  rows: number[];
}

/**
 * Groups pasted rows into creators (rows from the same name, or the same handle when there is
 * no name) and resolves each to a registry creator or a provisional new ID.
 */
export function resolveRowCreators(
  rows: { values: Record<string, string>; include: boolean }[],
  index: CreatorIndex,
): { byRow: (RowCreator | null)[]; groups: CreatorGroup[] } {
  const groups = new Map<string, CreatorGroup>();
  rows.forEach((r, i) => {
    const v = r.values;
    if (v.creator_id?.trim()) return;
    const handle = cleanHandle(v.handle ?? '');
    const name = (v.name ?? v.creator_name ?? '').trim();
    if (!handle && !name) return;
    const platform = v.platform ? normalizeParam('utm_source', v.platform) : '';
    const key = name ? `n:${nameKey(name)}` : `h:${handle}`;
    const g = groups.get(key) ?? { key, input: { name, handles: {} }, rows: [] };
    if (handle && platform && !g.input.handles[platform]) g.input.handles[platform] = handle;
    else if (handle && !platform && !Object.values(g.input.handles).includes(handle)) g.input.handles[`other_${Object.keys(g.input.handles).length + 1}`] = handle;
    g.rows.push(i);
    groups.set(key, g);
  });

  const byRow: (RowCreator | null)[] = rows.map(() => null);
  let next = index.next;
  for (const g of groups.values()) {
    const found = matchCreator(index, g.input);
    const resolved: RowCreator = found
      ? { group: g.key, id: found.id, isNew: false, creator: found }
      : { group: g.key, id: formatCreatorId(next++), isNew: true };
    g.rows.forEach((i) => (byRow[i] = resolved));
  }
  return { byRow, groups: [...groups.values()] };
}
