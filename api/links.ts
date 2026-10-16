/**
 * The shared link library (Vercel Function).
 *
 *   GET    /api/links   every link, newest first
 *   POST   /api/links   save links; ones already in the library come back as `existing`
 *   PATCH  /api/links   archive / restore / edit notes
 *   DELETE /api/links   delete for good (the UI only offers this for archived links)
 *
 * Storage is Postgres via DATABASE_URL (set automatically when a Neon database is connected to
 * the Vercel project). Without it, GET reports `storage: 'none'` and the app still builds links
 * but can't save them. The table is created on first use.
 *
 * This file only imports types from src/, so Vercel can deploy it without bundling.
 */
import { neon } from '@neondatabase/serverless';
import type {
  DeleteRequest,
  LibraryResponse,
  LinkRecord,
  NewLink,
  SaveRequest,
  SaveResponse,
  UpdateRequest,
} from '../src/lib/types';

export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

declare global {
  // Local dev and tests swap in an embedded Postgres (PGlite) here.
  var __utmQuery: Query | undefined;
}

const MAX_LINKS_PER_SAVE = 1000;
const MAX_LINKS_LISTED = 20000;

function getQuery(): Query | null {
  if (globalThis.__utmQuery) return globalThis.__utmQuery;
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) return null;
  const sql = neon(url);
  return (text, params) => sql.query(text, params) as Promise<Record<string, unknown>[]>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS utm_links (
    id text PRIMARY KEY,
    seq bigint GENERATED ALWAYS AS IDENTITY,
    url text NOT NULL UNIQUE,
    base_url text NOT NULL,
    params jsonb NOT NULL,
    channel text NOT NULL,
    label text NOT NULL DEFAULT '',
    batch_id text,
    batch_name text,
    notes text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active',
    created_by text NOT NULL DEFAULT '',
    team text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS utm_links_created_at_idx ON utm_links (created_at DESC)`,
];

const ready = new WeakMap<Query, Promise<void>>();
function ensureSchema(query: Query): Promise<void> {
  let p = ready.get(query);
  if (!p) {
    p = SCHEMA.reduce<Promise<unknown>>((prev, stmt) => prev.then(() => query(stmt)), Promise.resolve()).then(() => undefined);
    p.catch(() => ready.delete(query));
    ready.set(query, p);
  }
  return p;
}

const iso = (v: unknown): string => (v instanceof Date ? v : new Date(String(v))).toISOString();

function toRecord(row: Record<string, unknown>): LinkRecord {
  return {
    id: String(row.id),
    seq: Number(row.seq),
    url: String(row.url),
    baseUrl: String(row.base_url),
    params: (typeof row.params === 'string' ? JSON.parse(row.params) : row.params) as LinkRecord['params'],
    channel: String(row.channel),
    label: String(row.label ?? ''),
    batchId: (row.batch_id as string | null) ?? null,
    batchName: (row.batch_name as string | null) ?? null,
    notes: String(row.notes ?? ''),
    status: row.status === 'archived' ? 'archived' : 'active',
    createdBy: String(row.created_by ?? ''),
    team: String(row.team ?? ''),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const fail = (status: number, error: string): Response => json({ error }, status);

const newId = (prefix: string): string => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.slice(0, max) : '');

function cleanLink(raw: unknown): NewLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const url = str(r.url, 4000);
  if (!/^https?:\/\/\S+$/i.test(url)) return null;
  const params = r.params && typeof r.params === 'object' && !Array.isArray(r.params) ? r.params : {};
  const cleanParams = Object.fromEntries(
    Object.entries(params as Record<string, unknown>)
      .filter(([k, v]) => /^utm_[a-z_]+$/.test(k) && typeof v === 'string')
      .map(([k, v]) => [k, (v as string).slice(0, 500)]),
  );
  return {
    url,
    baseUrl: str(r.baseUrl, 4000) || url,
    params: cleanParams,
    channel: str(r.channel, 64) || 'other',
    label: str(r.label, 300),
    notes: str(r.notes),
    createdBy: str(r.createdBy, 120),
    team: str(r.team, 120),
  };
}

async function list(query: Query): Promise<Response> {
  // Newest first; links saved together keep the order they were pasted in.
  const rows = await query(`SELECT * FROM utm_links ORDER BY created_at DESC, seq LIMIT ${MAX_LINKS_LISTED}`);
  return json({ storage: 'database', links: rows.map(toRecord) } satisfies LibraryResponse);
}

async function save(query: Query, body: SaveRequest): Promise<Response> {
  if (!Array.isArray(body?.links)) return fail(400, 'Expected { links: [...] }.');
  if (body.links.length > MAX_LINKS_PER_SAVE) return fail(400, `Save at most ${MAX_LINKS_PER_SAVE} links at a time.`);
  const cleaned = body.links.map(cleanLink);
  const bad = cleaned.findIndex((l) => !l);
  if (bad !== -1) return fail(400, `Link ${bad + 1} has no valid URL.`);

  // One row per URL, first one wins.
  const unique = [...new Map((cleaned as NewLink[]).map((l) => [l.url, l])).values()];
  if (!unique.length) return json({ created: [], existing: [] } satisfies SaveResponse);

  const batchName = str(body.batchName, 200).trim();
  const batchId = batchName && unique.length > 1 ? newId('b') : null;
  // RETURNING follows insertion order, which is the order the links were sent in.

  const values: unknown[] = [];
  const tuples = unique.map((l) => {
    const cols = [newId('l'), l.url, l.baseUrl, JSON.stringify(l.params), l.channel, l.label, batchId, batchId ? batchName : null, l.notes, l.createdBy, l.team];
    const start = values.length;
    values.push(...cols);
    return `(${cols.map((_, i) => `$${start + i + 1}${i === 3 ? '::jsonb' : ''}`).join(', ')})`;
  });
  const inserted = await query(
    `INSERT INTO utm_links (id, url, base_url, params, channel, label, batch_id, batch_name, notes, created_by, team)
     VALUES ${tuples.join(', ')}
     ON CONFLICT (url) DO NOTHING
     RETURNING *`,
    values,
  );
  const createdUrls = new Set(inserted.map((r) => String(r.url)));
  const existingUrls = unique.map((l) => l.url).filter((u) => !createdUrls.has(u));
  let existing: Record<string, unknown>[] = [];
  if (existingUrls.length) {
    // Asking for a link again restores it if archived, and files it under this batch if it had none.
    await query(
      `UPDATE utm_links
          SET status = 'active',
              batch_id = COALESCE(batch_id, $2),
              batch_name = CASE WHEN batch_id IS NULL THEN $3 ELSE batch_name END,
              updated_at = now()
        WHERE url = ANY($1) AND (status = 'archived' OR (batch_id IS NULL AND $2::text IS NOT NULL))`,
      [existingUrls, batchId, batchId ? batchName : null],
    );
    existing = await query(`SELECT * FROM utm_links WHERE url = ANY($1) ORDER BY seq`, [existingUrls]);
  }
  return json({ created: inserted.map(toRecord), existing: existing.map(toRecord) } satisfies SaveResponse);
}

async function update(query: Query, body: UpdateRequest): Promise<Response> {
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id) => typeof id === 'string') : [];
  if (!ids.length) return fail(400, 'Expected { ids: [...], patch: {...} }.');
  const patch = body.patch ?? {};
  const status = patch.status === 'archived' || patch.status === 'active' ? patch.status : null;
  const notes = typeof patch.notes === 'string' ? patch.notes.slice(0, 2000) : null;
  const label = typeof patch.label === 'string' ? patch.label.slice(0, 300) : null;
  const rows = await query(
    `UPDATE utm_links
        SET status = COALESCE($2, status), notes = COALESCE($3, notes), label = COALESCE($4, label), updated_at = now()
      WHERE id = ANY($1)
      RETURNING *`,
    [ids, status, notes, label],
  );
  return json({ updated: rows.map(toRecord) });
}

async function remove(query: Query, body: DeleteRequest): Promise<Response> {
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id) => typeof id === 'string') : [];
  if (!ids.length) return fail(400, 'Expected { ids: [...] }.');
  const rows = await query(`DELETE FROM utm_links WHERE id = ANY($1) RETURNING id`, [ids]);
  return json({ deleted: rows.map((r) => String(r.id)) });
}

export async function handle(request: Request, query: Query | null): Promise<Response> {
  if (!query) {
    if (request.method === 'GET') return json({ storage: 'none', links: [] } satisfies LibraryResponse);
    return fail(503, 'No database connected. Connect a Postgres database (Neon) to the Vercel project to save links.');
  }
  try {
    await ensureSchema(query);
    if (request.method === 'GET') return await list(query);
    const body = await request.json().catch(() => null);
    if (request.method === 'POST') return await save(query, body);
    if (request.method === 'PATCH') return await update(query, body);
    if (request.method === 'DELETE') return await remove(query, body);
    return fail(405, 'Method not allowed.');
  } catch (err) {
    console.error(err);
    return fail(500, err instanceof Error ? err.message : 'Something went wrong.');
  }
}

export const GET = (request: Request) => handle(request, getQuery());
export const POST = (request: Request) => handle(request, getQuery());
export const PATCH = (request: Request) => handle(request, getQuery());
export const DELETE = (request: Request) => handle(request, getQuery());
