import { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CreatorsResponse, SaveCreatorsResponse } from '../src/lib/types';
import { handle } from '../api/creators';
import type { Query } from '../api/_db';

let query: Query;
beforeAll(async () => {
  const db = new PGlite();
  await db.waitReady;
  query = async (text, params) => (await db.query<Record<string, unknown>>(text, params)).rows;
}, 60_000);

const call = async <T>(method: string, body?: unknown): Promise<{ status: number; data: T }> => {
  const res = await handle(new Request('http://localhost/api/creators', { method, body: body ? JSON.stringify(body) : undefined }), query);
  return { status: res.status, data: (await res.json()) as T };
};

describe('/api/creators', () => {
  it('reports no storage without a database', async () => {
    const res = await handle(new Request('http://localhost/api/creators'), null);
    expect(await res.json()).toEqual({ storage: 'none', creators: [] });
  });

  it('assigns sequential IDs and matches the same creator within one save', async () => {
    const { data } = await call<SaveCreatorsResponse>('POST', {
      createdBy: 'Brooke',
      creators: [
        { name: 'Olivia Zhang', handles: { instagram: '@OliviaZhangOfficial', tiktok: 'livviazhang' } },
        { name: 'Mia & Lexie', handles: { instagram: 'itsthekitchentable' } },
        { name: 'Mia & Lexie', handles: { tiktok: 'itsthekitchentable' } },
      ],
    });
    expect(data.created).toEqual(['CT0001', 'CT0002']);
    expect(data.creators.map((c) => c.id)).toEqual(['CT0001', 'CT0002', 'CT0002']);
    expect(data.creators[0].handles).toEqual({ instagram: 'oliviazhangofficial', tiktok: 'livviazhang' });
    expect(data.creators[2].handles).toEqual({ instagram: 'itsthekitchentable', tiktok: 'itsthekitchentable' });
    expect(data.creators[0].createdBy).toBe('Brooke');
  });

  it('finds existing creators by handle on a later save', async () => {
    const { data } = await call<SaveCreatorsResponse>('POST', {
      creators: [
        { name: 'Olivia', handles: { tiktok: 'livviazhang' } },
        { name: 'Josh Lewis', handles: { instagram: 'josh_jogs' } },
        { name: 'Mia and Lexie', handles: { youtube: 'itsthekitchentable' } },
      ],
    });
    expect(data.creators.map((c) => c.id)).toEqual(['CT0001', 'CT0003', 'CT0002']);
    expect(data.created).toEqual(['CT0003']);
    expect(data.creators[0].name).toBe('Olivia Zhang');
    expect(data.creators[2].handles.youtube).toBe('itsthekitchentable');
  });

  it('keeps an ID Hark already issued, and continues numbering after it', async () => {
    const issued = await call<SaveCreatorsResponse>('POST', { creators: [{ name: 'Helen Gu', handles: { instagram: 'thehelengu' }, id: 'ct0042' }] });
    expect(issued.data.creators[0].id).toBe('CT0042');
    const next = await call<SaveCreatorsResponse>('POST', { creators: [{ name: 'Deniza', handles: { instagram: 'ux_deniza' } }] });
    expect(next.data.creators[0].id).toBe('CT0043');
  });

  it('refuses an imported ID that belongs to a different creator', async () => {
    const clash = await call<{ error: string }>('POST', { creators: [{ name: 'Someone Else', handles: { instagram: 'someone' }, id: 'CT0001' }] });
    expect(clash.status).toBe(409);
    expect(clash.data.error).toMatch(/Olivia Zhang/);
    const reimport = await call<SaveCreatorsResponse>('POST', { creators: [{ name: 'Olivia Zhang', handles: { instagram: 'oliviazhangofficial' }, id: 'CT0001' }] });
    expect(reimport.data.created).toEqual([]);
  });

  it('edits a creator, swaps its ID, and refuses a handle that belongs to someone else', async () => {
    const renamed = await call<{ creator: { id: string; name: string } }>('PATCH', { id: 'CT0003', patch: { name: 'Josh Lewis (runner)', id: 'CT0100' } });
    expect(renamed.data.creator).toMatchObject({ id: 'CT0100', name: 'Josh Lewis (runner)' });
    const clash = await call<{ error: string }>('PATCH', { id: 'CT0100', patch: { handles: { tiktok: 'livviazhang' } } });
    expect(clash.status).toBe(409);
    expect(clash.data.error).toMatch(/Olivia Zhang/);
    expect((await call('PATCH', { id: 'CT0100', patch: { id: 'CT0001' } })).status).toBe(409);
    expect((await call('PATCH', { id: 'CT0100', patch: { id: 'olivia' } })).status).toBe(400);
  });

  it('lists everyone and rejects empty creators', async () => {
    const { data } = await call<CreatorsResponse>('GET');
    expect(data.creators.map((c) => c.id)).toEqual(['CT0001', 'CT0002', 'CT0042', 'CT0043', 'CT0100']);
    expect((await call('POST', { creators: [{ name: ' ', handles: {} }] })).status).toBe(400);
  });
});
