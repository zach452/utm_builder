import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { LibraryResponse, NewLink, SaveResponse } from '../src/lib/types';
import { handle, type Query } from '../api/links';

let query: Query;
beforeAll(async () => {
  const db = new PGlite();
  await db.waitReady;
  query = async (text, params) => (await db.query<Record<string, unknown>>(text, params)).rows;
}, 60_000);

const call = async <T>(method: string, body?: unknown): Promise<{ status: number; data: T }> => {
  const res = await handle(
    new Request('http://localhost/api/links', { method, body: body ? JSON.stringify(body) : undefined }),
    query,
  );
  return { status: res.status, data: (await res.json()) as T };
};

const link = (content: string, extra: Partial<NewLink> = {}): NewLink => ({
  url: `https://hark.com/?utm_source=tiktok&utm_medium=creator&utm_campaign=creator_always_on&utm_content=${content}`,
  baseUrl: 'https://hark.com/',
  params: { utm_source: 'tiktok', utm_medium: 'creator', utm_campaign: 'creator_always_on', utm_content: content },
  channel: 'creator',
  label: `${content} · tiktok`,
  notes: '',
  createdBy: 'Zach',
  team: 'Creator',
  ...extra,
});

describe('/api/links', () => {
  it('reports no storage without a database', async () => {
    const res = await handle(new Request('http://localhost/api/links'), null);
    expect(await res.json()).toEqual({ storage: 'none', links: [] });
    const post = await handle(new Request('http://localhost/api/links', { method: 'POST', body: '{}' }), null);
    expect(post.status).toBe(503);
  });

  it('saves a batch and returns duplicates as existing', async () => {
    const first = await call<SaveResponse>('POST', { links: [link('a'), link('b'), link('a')], batchName: 'Creators Oct' });
    expect(first.status).toBe(200);
    expect(first.data.created).toHaveLength(2);
    expect(first.data.created[0].batchName).toBe('Creators Oct');
    expect(first.data.created[0].batchId).toBe(first.data.created[1].batchId);
    expect(first.data.created[0].params.utm_content).toBe('a');

    const again = await call<SaveResponse>('POST', { links: [link('b'), link('c')] });
    expect(again.data.created.map((l) => l.params.utm_content)).toEqual(['c']);
    expect(again.data.existing.map((l) => l.params.utm_content)).toEqual(['b']);
    expect(again.data.created[0].batchId).toBeNull();
  });

  it('files an unbatched existing link under the new batch, keeping paste order', async () => {
    const res = await call<SaveResponse>('POST', { links: [link('c'), link('d'), link('e')], batchName: 'Wave 2' });
    expect(res.data.created.map((l) => l.params.utm_content)).toEqual(['d', 'e']);
    expect(res.data.existing[0]).toMatchObject({ batchName: 'Wave 2', batchId: res.data.created[0].batchId });
    const list = (await call<LibraryResponse>('GET')).data.links;
    expect(list.slice(0, 2).map((l) => l.params.utm_content)).toEqual(['d', 'e']);
    // Links already in a batch stay where they are.
    const kept = await call<SaveResponse>('POST', { links: [link('a'), link('f')], batchName: 'Wave 3' });
    expect(kept.data.existing[0].batchName).toBe('Creators Oct');
    await call('DELETE', { ids: [...res.data.created, ...kept.data.created].map((l) => l.id) });
  });

  it('lists newest first', async () => {
    const { data } = await call<LibraryResponse>('GET');
    expect(data.storage).toBe('database');
    expect(data.links).toHaveLength(3);
    expect(data.links[0].params.utm_content).toBe('c');
    expect(data.links.slice(1).map((l) => l.params.utm_content).sort()).toEqual(['a', 'b']);
    expect(new Date(data.links[0].createdAt).toString()).not.toBe('Invalid Date');
  });

  it('archives, restores on re-save, and deletes', async () => {
    const { data } = await call<LibraryResponse>('GET');
    const c = data.links.find((l) => l.params.utm_content === 'c')!;
    const archived = await call<{ updated: { status: string; notes: string }[] }>('PATCH', { ids: [c.id], patch: { status: 'archived', notes: 'old' } });
    expect(archived.data.updated[0]).toMatchObject({ status: 'archived', notes: 'old' });

    const resaved = await call<SaveResponse>('POST', { links: [link('c')] });
    expect(resaved.data.existing[0].status).toBe('active');

    const deleted = await call<{ deleted: string[] }>('DELETE', { ids: [c.id] });
    expect(deleted.data.deleted).toEqual([c.id]);
    expect((await call<LibraryResponse>('GET')).data.links).toHaveLength(2);
  });

  it('rejects bad input', async () => {
    expect((await call('POST', { links: [{ url: 'javascript:alert(1)' }] })).status).toBe(400);
    expect((await call('POST', { nope: true })).status).toBe(400);
    expect((await call('PATCH', { ids: [] })).status).toBe(400);
    expect((await call('PUT', {})).status).toBe(405);
  });
});
