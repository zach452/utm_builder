/**
 * Shared by the API functions: the database connection, the schema and response helpers.
 * Files starting with _ in /api are not deployed as functions of their own.
 *
 * Storage is Postgres via DATABASE_URL (set automatically when a Neon database is connected to
 * the Vercel project). The tables are created on first use.
 */
import { neon } from '@neondatabase/serverless';

export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

declare global {
  // Local dev and tests swap in an embedded Postgres (PGlite) here.
  var __utmQuery: Query | undefined;
}

export function getQuery(): Query | null {
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
export function ensureSchema(query: Query): Promise<void> {
  let p = ready.get(query);
  if (!p) {
    p = SCHEMA.reduce<Promise<unknown>>((prev, stmt) => prev.then(() => query(stmt)), Promise.resolve()).then(() => undefined);
    p.catch(() => ready.delete(query));
    ready.set(query, p);
  }
  return p;
}

export const iso = (v: unknown): string => (v instanceof Date ? v : new Date(String(v))).toISOString();

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export const fail = (status: number, error: string): Response => json({ error }, status);

export const NO_DATABASE = 'No database connected. Connect a Postgres database (Neon) to the Vercel project to save.';

export const newId = (prefix: string): string => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

export const str = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.slice(0, max) : '');

export const parseJson = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;

/** Runs a handler with the schema in place, turning thrown errors into a 500. */
export async function withDb(query: Query, run: () => Promise<Response>): Promise<Response> {
  try {
    await ensureSchema(query);
    return await run();
  } catch (err) {
    console.error(err);
    return fail(500, err instanceof Error ? err.message : 'Something went wrong.');
  }
}
