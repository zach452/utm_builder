import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDump, parseRosterLine } from './dump';

const roster = readFileSync(resolve(import.meta.dirname, '../../examples/hark-creators-oct-2026.txt'), 'utf8');

describe('creator roster', () => {
  const parsed = parseDump(roster);
  const byKey = new Map(parsed.rows.map((r) => [`${r.values.name}|${r.values.platform}`, r]));

  it('detects a roster and skips the intro line', () => {
    expect(parsed.kind).toBe('roster');
    expect(parsed.ignored).toHaveLength(1);
    expect(parsed.ignored[0]).toMatch(/^please can we create UTMs/);
  });

  it('makes one row per creator per platform', () => {
    // 24 live creators: 19 on TikTok + IG, 5 on IG only. Plus 2 struck through (1 platform each).
    const included = parsed.rows.filter((r) => r.include);
    expect(included).toHaveLength(43);
    expect(parsed.rows).toHaveLength(45);
  });

  it('leaves struck-through creators out', () => {
    expect(byKey.get('Hannah Wilson|instagram')?.include).toBe(false);
    expect(byKey.get('Slidebean|youtube')?.include).toBe(false);
    expect(byKey.get('Slidebean|youtube')?.values.placement).toBe('description');
    expect(byKey.get('Hannah Wilson|instagram')?.values.placement).toBe('comment');
  });

  it('uses the right handle per platform', () => {
    expect(byKey.get('Olivia Zhang|instagram')?.values.handle).toBe('oliviazhangofficial');
    expect(byKey.get('Olivia Zhang|tiktok')?.values.handle).toBe('livviazhang');
    expect(byKey.get('Henry Belcaster|instagram')?.values.handle).toBe('smart.nonsense');
    expect(byKey.get('Henry Belcaster|tiktok')?.values.handle).toBe('smartnonsense');
    expect(byKey.get('Abhijay Vuyyuru|instagram')?.values.handle).toBe('abhijayarora_');
    expect(byKey.get('Mia & Lexie|tiktok')?.values.handle).toBe('itsthekitchentable');
    expect(byKey.get('Mia & Lexie|instagram')?.values.handle).toBe('itsthekitchentable');
    expect(byKey.get('Khani|tiktok')?.values.handle).toBe('khani.trendy');
    expect(byKey.get('Emma Steuer|tiktok')?.values.handle).toBe('emmyxtech');
    expect(byKey.get('Sistersnacking|instagram')?.values.handle).toBe('sistersnacking');
    expect(byKey.get('Lillian Chiu|instagram')?.values.handle).toBe('lillian__chiu');
  });

  it('keeps aliases and placements', () => {
    const mav = byKey.get('MavGPT|tiktok');
    expect(mav?.values.handle).toBe('maverickgpt');
    expect(mav?.values.alias).toBe('Maverick Maltin');
    expect(mav?.values.placement).toBe('link_in_bio');
    expect(mav?.values.details).toBe('link in bio code');
  });

  it('flags a platform with no handle and falls back to the other one', () => {
    const courtney = byKey.get('Courtney Johnson|tiktok');
    expect(courtney?.values.handle).toBe('courtlynnjohnson');
    expect(courtney?.flags.join()).toMatch(/No TikTok handle/);
    expect(byKey.get('Courtney Johnson|instagram')?.flags).toEqual([]);
  });

  it('only flags what is actually missing', () => {
    const flagged = parsed.rows.filter((r) => r.include && r.flags.length).map((r) => `${r.values.name}|${r.values.platform}`);
    expect(flagged).toEqual(['Courtney Johnson|tiktok']);
  });
});

describe('other roster shapes', () => {
  it('reads handles outside parentheses and Slack-style strikethrough', () => {
    expect(parseRosterLine('• Jane Doe - @janedoe - TikTok - bio')?.[0].values).toMatchObject({
      name: 'Jane Doe',
      handle: 'janedoe',
      platform: 'tiktok',
      placement: 'link_in_bio',
    });
    expect(parseRosterLine('~Jane Doe (@janedoe) - IG~')?.[0].include).toBe(false);
  });

  it('reads "@a on IG, @b on TT"', () => {
    const rows = parseRosterLine('Sam (@samcooks on IG, @samcooks_tt on TT) - IG and TikTok - link in bio');
    expect(rows?.map((r) => [r.values.platform, r.values.handle])).toEqual([
      ['instagram', 'samcooks'],
      ['tiktok', 'samcooks_tt'],
    ]);
  });
});

describe('tables and lists', () => {
  it('reads a pasted spreadsheet (TSV) with @ in the data', () => {
    const parsed = parseDump('Creator Name\tHandle\tPlatform\nJane Doe\t@janedoe\tTikTok\nSam Lee\t@samlee\tIG');
    expect(parsed.kind).toBe('table');
    expect(parsed.columns).toEqual(['creator_name', 'handle', 'platform']);
    expect(parsed.rows[1].values).toEqual({ creator_name: 'Sam Lee', handle: '@samlee', platform: 'IG' });
  });

  it('reads CSV with quoted commas', () => {
    const parsed = parseDump('campaign,content,url\n"Launch, wave 1",hero,https://hark.com/a\nLaunch 2,footer,https://hark.com/b');
    expect(parsed.kind).toBe('table');
    expect(parsed.rows[0].values.campaign).toBe('Launch, wave 1');
  });

  it('falls back to a plain list', () => {
    const parsed = parseDump('morning brew\nthe hustle\n- tldr');
    expect(parsed.kind).toBe('list');
    expect(parsed.rows.map((r) => r.values.value)).toEqual(['morning brew', 'the hustle', 'tldr']);
  });
});
