/**
 * The creator registry (Vercel Function): one Hark creator ID (CT0042) per creator account,
 * with its handle on each platform. Links for the same creator on Instagram and TikTok, in a
 * bio or a paid post, all carry the same ID.
 *
 *   GET   /api/creators   every creator
 *   POST  /api/creators   match creators by handle (or name) and create the ones that are new
 *   PATCH /api/creators   rename, edit handles, or swap in an ID Hark already issued
 */
import type {
  CreatorRecord,
  CreatorsResponse,
  NewCreator,
  SaveCreatorsRequest,
  SaveCreatorsResponse,
  UpdateCreatorRequest,
} from '../src/lib/types';
import { fail, getQuery, iso, json, NO_DATABASE, parseJson, str, withDb, type Query } from './_db.js';

const ID_RE = /^CT[0-9]{4,}$/;
const MAX_PER_SAVE = 500;

/** "@Khani.Trendy." → "khani.trendy". Stored as typed otherwise, so it matches what's on the platform. */
export const cleanHandle = (h: string): string => h.trim().replace(/^@+/, '').replace(/\.+$/, '').toLowerCase();
const cleanName = (n: string): string => n.trim().replace(/\s+/g, ' ');
const nameKey = (n: string): string => cleanName(n).toLowerCase();

function cleanHandles(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [platform, handle] of Object.entries(raw as Record<string, unknown>)) {
    const p = platform.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const h = typeof handle === 'string' ? cleanHandle(handle).slice(0, 100) : '';
    if (p && h) out[p] = h;
  }
  return out;
}

function toRecord(row: Record<string, unknown>): CreatorRecord {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    handles: parseJson<Record<string, string>>(row.handles ?? {}),
    notes: String(row.notes ?? ''),
    createdBy: String(row.created_by ?? ''),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

const idNumber = (id: string): number => (ID_RE.test(id) ? Number(id.slice(2)) : 0);
const formatId = (n: number): string => `CT${String(n).padStart(4, '0')}`;

async function listAll(query: Query): Promise<CreatorRecord[]> {
  const rows = await query(`SELECT * FROM utm_creators ORDER BY id`);
  return rows.map(toRecord);
}

/** In-memory index of the registry, so one request can match and create many creators. */
class Registry {
  private byHandle = new Map<string, CreatorRecord>();
  private byName = new Map<string, CreatorRecord>();
  private byId = new Map<string, CreatorRecord>();
  next: number;

  constructor(creators: CreatorRecord[]) {
    creators.forEach((c) => this.add(c));
    this.next = Math.max(0, ...creators.map((c) => idNumber(c.id))) + 1;
  }

  add(c: CreatorRecord) {
    this.byId.set(c.id, c);
    if (c.name) this.byName.set(nameKey(c.name), c);
    for (const [p, h] of Object.entries(c.handles)) this.byHandle.set(`${p}:${h}`, c);
  }

  has = (id: string) => this.byId.has(id);

  /** Same handle on the same platform; then the same handle anywhere; then, with no handles given, the same name. */
  match(input: { id?: string; name: string; handles: Record<string, string> }): CreatorRecord | undefined {
    if (input.id && this.byId.has(input.id)) return this.byId.get(input.id);
    for (const [p, h] of Object.entries(input.handles)) {
      const hit = this.byHandle.get(`${p}:${h}`);
      if (hit) return hit;
    }
    const handles = new Set(Object.values(input.handles));
    for (const c of this.byId.values()) {
      if (Object.values(c.handles).some((h) => handles.has(h))) return c;
    }
    if (!Object.keys(input.handles).length && input.name) return this.byName.get(nameKey(input.name));
    return undefined;
  }

  /** Platforms the creator has no handle for yet; existing handles are never overwritten here. */
  missingHandles(c: CreatorRecord, handles: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(handles).filter(([p, h]) => !c.handles[p] && !this.byHandle.has(`${p}:${h}`)));
  }
}

/** An explicit ID matched: only accept it if the name or a handle agrees, so two lists can't merge different people. */
const sameCreator = (c: CreatorRecord, input: { name: string; handles: Record<string, string> }): boolean =>
  (!!input.name && nameKey(input.name) === nameKey(c.name)) || Object.values(input.handles).some((h) => Object.values(c.handles).includes(h));

async function save(query: Query, body: SaveCreatorsRequest): Promise<Response> {
  if (!Array.isArray(body?.creators)) return fail(400, 'Expected { creators: [...] }.');
  if (body.creators.length > MAX_PER_SAVE) return fail(400, `Save at most ${MAX_PER_SAVE} creators at a time.`);
  const createdBy = str(body.createdBy, 120);
  const registry = new Registry(await listAll(query));
  const out: CreatorRecord[] = [];
  const created: string[] = [];

  for (const raw of body.creators as unknown[]) {
    const r = (raw ?? {}) as Partial<NewCreator>;
    const input = {
      name: cleanName(str(r.name, 200)),
      handles: cleanHandles(r.handles),
      id: typeof r.id === 'string' && ID_RE.test(r.id.trim().toUpperCase()) ? r.id.trim().toUpperCase() : undefined,
    };
    if (!input.name && !Object.keys(input.handles).length) return fail(400, 'Each creator needs a name or a handle.');

    const found = registry.match(input);
    if (found && input.id === found.id && !sameCreator(found, input)) {
      return fail(409, `${found.id} already belongs to ${found.name}. Check the ID before importing.`);
    }
    if (found) {
      const extra = registry.missingHandles(found, input.handles);
      if (Object.keys(extra).length) {
        const [row] = await query(
          `UPDATE utm_creators SET handles = handles || $2::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
          [found.id, JSON.stringify(extra)],
        );
        const updated = toRecord(row);
        registry.add(updated);
        out.push(updated);
      } else {
        out.push(found);
      }
      continue;
    }

    // New creator: the ID Hark gave, or the next free CT number. Retry if another save took it.
    let record: CreatorRecord | null = null;
    for (let attempt = 0; attempt < 5 && !record; attempt++) {
      const id = input.id && !registry.has(input.id) && attempt === 0 ? input.id : formatId(registry.next++);
      const rows = await query(
        `INSERT INTO utm_creators (id, name, handles, created_by) VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (id) DO NOTHING RETURNING *`,
        [id, input.name || Object.values(input.handles)[0], JSON.stringify(input.handles), createdBy],
      );
      if (rows[0]) record = toRecord(rows[0]);
      else registry.next = Math.max(registry.next, idNumber(id) + 1);
    }
    if (!record) return fail(409, 'Couldn’t assign a creator ID. Try again.');
    if (record.id && idNumber(record.id) >= registry.next) registry.next = idNumber(record.id) + 1;
    registry.add(record);
    out.push(record);
    created.push(record.id);
  }
  return json({ creators: out, created } satisfies SaveCreatorsResponse);
}

async function update(query: Query, body: UpdateCreatorRequest): Promise<Response> {
  const id = str(body?.id, 32);
  const patch = body?.patch ?? {};
  const all = await listAll(query);
  const current = all.find((c) => c.id === id);
  if (!current) return fail(404, `No creator ${id}.`);

  const nextId = typeof patch.id === 'string' && patch.id.trim() ? patch.id.trim().toUpperCase() : id;
  if (!ID_RE.test(nextId)) return fail(400, 'Creator IDs look like CT0042.');
  if (nextId !== id && all.some((c) => c.id === nextId)) return fail(409, `${nextId} already belongs to another creator.`);

  const handles = patch.handles === undefined ? null : cleanHandles(patch.handles);
  if (handles) {
    for (const [p, h] of Object.entries(handles)) {
      const owner = all.find((c) => c.id !== id && c.handles[p] === h);
      if (owner) return fail(409, `@${h} on ${p} already belongs to ${owner.name} (${owner.id}).`);
    }
  }
  const rows = await query(
    `UPDATE utm_creators
        SET id = $2,
            name = COALESCE($3, name),
            handles = COALESCE($4::jsonb, handles),
            notes = COALESCE($5, notes),
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [
      id,
      nextId,
      typeof patch.name === 'string' && cleanName(patch.name) ? cleanName(patch.name).slice(0, 200) : null,
      handles ? JSON.stringify(handles) : null,
      typeof patch.notes === 'string' ? patch.notes.slice(0, 2000) : null,
    ],
  );
  return json({ creator: toRecord(rows[0]) });
}

export async function handle(request: Request, query: Query | null): Promise<Response> {
  if (!query) {
    if (request.method === 'GET') return json({ storage: 'none', creators: [] } satisfies CreatorsResponse);
    return fail(503, NO_DATABASE);
  }
  return withDb(query, async () => {
    if (request.method === 'GET') return json({ storage: 'database', creators: await listAll(query) } satisfies CreatorsResponse);
    const body = await request.json().catch(() => null);
    if (request.method === 'POST') return save(query, body);
    if (request.method === 'PATCH') return update(query, body);
    return fail(405, 'Method not allowed.');
  });
}

export const GET = (request: Request) => handle(request, getQuery());
export const POST = (request: Request) => handle(request, getQuery());
export const PATCH = (request: Request) => handle(request, getQuery());
