import { describe, expect, it } from 'vitest';
import { creatorForContent, indexCreators, resolveRowCreators } from './creators';
import type { CreatorRecord } from './types';
import { creatorsFromTable } from '../views/CreatorsView';

const creator = (id: string, name: string, handles: Record<string, string>): CreatorRecord => ({
  id,
  name,
  handles,
  notes: '',
  createdBy: '',
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
});

const registry = [
  creator('CT0001', 'Olivia Zhang', { instagram: 'oliviazhangofficial', tiktok: 'livviazhang' }),
  creator('CT0007', 'Khani', { instagram: 'khani.trendy' }),
];

const row = (name: string, handle: string, platform: string) => ({ values: { name, handle, platform }, include: true });

describe('resolveRowCreators', () => {
  it('reuses registry IDs and numbers new creators after the highest one', () => {
    const { byRow, groups } = resolveRowCreators(
      [
        row('Olivia Zhang', 'livviazhang', 'tiktok'),
        row('Olivia Zhang', 'oliviazhangofficial', 'instagram'),
        row('Josh Lewis', '@josh_jogs', 'IG'),
        row('Khani', 'khani.trendy', 'tiktok'),
        row('Mia & Lexie', 'itsthekitchentable', 'tiktok'),
        row('Mia & Lexie', 'itsthekitchentable', 'instagram'),
      ],
      indexCreators(registry),
    );
    expect(byRow.map((r) => `${r?.id}${r?.isNew ? '*' : ''}`)).toEqual(['CT0001', 'CT0001', 'CT0008*', 'CT0007', 'CT0009*', 'CT0009*']);
    expect(groups.find((g) => g.key === 'n:josh lewis')?.input).toEqual({ name: 'Josh Lewis', handles: { instagram: 'josh_jogs' } });
    expect(groups.find((g) => g.key === 'n:mia & lexie')?.input.handles).toEqual({ tiktok: 'itsthekitchentable', instagram: 'itsthekitchentable' });
  });

  it('leaves rows that already carry a creator ID alone', () => {
    const { byRow } = resolveRowCreators([{ values: { name: 'X', handle: 'x', platform: 'tiktok', creator_id: 'CT0500' }, include: true }], indexCreators([]));
    expect(byRow).toEqual([null]);
  });
});

describe('creatorForContent', () => {
  it('matches a handle once both are cleaned up', () => {
    expect(creatorForContent(registry, 'khani_trendy')?.id).toBe('CT0007');
    expect(creatorForContent(registry, '@LivviaZhang')?.id).toBe('CT0001');
    expect(creatorForContent(registry, 'nobody')).toBeUndefined();
  });
});

describe('creatorsFromTable', () => {
  it('reads the Creators tab download and Hark-style ID lists', () => {
    const list = creatorsFromTable([
      ['hark_creator_id', 'name', 'instagram', 'tiktok', 'youtube', 'created_by'],
      ['CT0014', 'Olivia Zhang', 'oliviazhangofficial', 'livviazhang', '', 'Zach'],
      ['', 'Josh Lewis', 'josh_jogs', '', '', ''],
    ]);
    expect(list).toEqual([
      { name: 'Olivia Zhang', id: 'CT0014', handles: { instagram: 'oliviazhangofficial', tiktok: 'livviazhang' } },
      { name: 'Josh Lewis', id: undefined, handles: { instagram: 'josh_jogs' } },
    ]);
    expect(creatorsFromTable([['Creator', 'IG', 'TT'], ['Khani', '@khani.trendy', '']])).toEqual([
      { name: 'Khani', id: undefined, handles: { instagram: '@khani.trendy' } },
    ]);
  });
});
