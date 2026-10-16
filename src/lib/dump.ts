import { columnKey, type Row } from './template';

/**
 * Turns whatever someone pastes into rows:
 *  - a table copied from Sheets/Excel, or a CSV (first row is the header)
 *  - a creator roster, one creator per line: "Name (@handle) - TikTok and IG - link in bio"
 *  - a plain list, one value per line
 */
export type DumpKind = 'table' | 'roster' | 'list' | 'empty';

export interface DumpRow {
  values: Row;
  include: boolean;
  flags: string[];
}

export interface ParsedDump {
  kind: DumpKind;
  columns: string[];
  rows: DumpRow[];
  /** Lines that didn't look like data (a greeting, a question) and were left out. */
  ignored: string[];
}

// ---------- CSV / TSV ----------

export function parseDelimited(text: string, delimiter?: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const d = delimiter ?? (firstLine.includes('\t') ? '\t' : firstLine.includes(',') ? ',' : firstLine.includes(';') ? ';' : '\t');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      quoted = true;
    } else if (ch === d) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function tableFromCells(cells: unknown[][]): ParsedDump {
  const grid = cells
    .map((r) => r.map((c) => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim())))
    .filter((r) => r.some((c) => c !== ''));
  if (grid.length === 0) return { kind: 'empty', columns: [], rows: [], ignored: [] };

  const seen = new Map<string, number>();
  const columns = grid[0].map((h, i) => {
    const base = columnKey(h) || `column_${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
  const rows = grid.slice(1).map((r) => ({
    values: Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ''])),
    include: true,
    flags: [],
  }));
  return { kind: 'table', columns, rows, ignored: [] };
}

function looksLikeTable(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : null;
  if (!delimiter) return false;
  const grid = parseDelimited(lines.join('\n'), delimiter);
  const width = grid[0].length;
  if (width < 2 || grid[0].some((h) => h.includes('@') || h.length > 40)) return false;
  const consistent = grid.slice(1).filter((r) => r.length === width).length;
  return consistent / (grid.length - 1) >= 0.8;
}

// ---------- Creator roster ----------

const PLATFORM_WORDS: [RegExp, string][] = [
  [/\b(?:tik\s?tok|tt)\b/gi, 'tiktok'],
  [/\b(?:instagram|insta|ig)\b/gi, 'instagram'],
  [/\b(?:youtube|yt)\b/gi, 'youtube'],
  [/\b(?:facebook|fb)\b/gi, 'facebook'],
  [/\bthreads\b/gi, 'threads'],
  [/\b(?:twitter|x\.com)\b/gi, 'x'],
  [/\blinkedin\b/gi, 'linkedin'],
  [/\bpinterest\b/gi, 'pinterest'],
  [/\b(?:snapchat|snap)\b/gi, 'snapchat'],
  [/\btwitch\b/gi, 'twitch'],
  [/\bsubstack\b/gi, 'substack'],
];

/** Platforms named in a piece of text, in the order they appear. */
export function platformsIn(text: string): string[] {
  const hits: [number, string][] = [];
  for (const [re, id] of PLATFORM_WORDS) {
    for (const m of text.matchAll(re)) hits.push([m.index ?? 0, id]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  return [...new Set(hits.map(([, id]) => id))];
}

const PLACEMENTS: [RegExp, string][] = [
  [/link\s*in\s*bio|bio\s*link|\bbio\b/i, 'link_in_bio'],
  [/pinned\s*comment/i, 'pinned_comment'],
  [/comment/i, 'comment'],
  [/description/i, 'description'],
  [/stor(y|ies)/i, 'story'],
  [/caption/i, 'caption'],
  [/newsletter/i, 'newsletter'],
];

export function placementOf(text: string): string {
  for (const [re, id] of PLACEMENTS) if (re.test(text)) return id;
  return text.trim();
}

const HANDLE_RE = /@([A-Za-z0-9._]+)/g;
const PLATFORM_NAMES: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  x: 'X',
};
const platformName = (id: string) => PLATFORM_NAMES[id] ?? id;

interface Handles {
  byPlatform: Map<string, string>;
  general: string[];
}

/** "IG @a, TT @b" · "@a on IG and TT" · "@a" */
function readHandles(chunk: string, into: Handles): void {
  const found = [...chunk.matchAll(HANDLE_RE)];
  if (!found.length) return;
  const prefixStyle = platformsIn(chunk.slice(0, found[0].index)).length > 0;
  found.forEach((m, i) => {
    const handle = m[1].replace(/\.+$/, '');
    const start = m.index ?? 0;
    const prevEnd = i === 0 ? 0 : (found[i - 1].index ?? 0) + found[i - 1][0].length;
    const nextStart = i === found.length - 1 ? chunk.length : (found[i + 1].index ?? chunk.length);
    const context = prefixStyle ? chunk.slice(prevEnd, start) : chunk.slice(start + m[0].length, nextStart);
    const platforms = platformsIn(context);
    if (platforms.length) {
      platforms.forEach((p) => {
        if (!into.byPlatform.has(p)) into.byPlatform.set(p, handle);
      });
    } else {
      into.general.push(handle);
    }
  });
}

const STRUCK_RE = /^~{1,2}([\s\S]+?)~{1,2}$/;
const BULLET_RE = /^\s*(?:[*\-•·▪◦–]|\d+[.)])\s+/;
const SPLIT_RE = /\s*(?:\||\s[-–—]+\s|[–—]|,|;|\t)\s*/;

/** Parses one roster line into one row per platform, or null if it isn't a roster line. */
export function parseRosterLine(line: string): DumpRow[] | null {
  let text = line.replace(BULLET_RE, '').trim();
  let struck = false;
  const strike = text.match(STRUCK_RE);
  if (strike) {
    struck = true;
    text = strike[1].trim();
  }
  if (!text) return null;

  const handles: Handles = { byPlatform: new Map(), general: [] };
  const aliases: string[] = [];
  const firstParen = text.indexOf('(');
  let name = firstParen > 0 ? text.slice(0, firstParen).trim() : '';

  // Parenthesised groups: handles, or an alias like "(Maverick Maltin)".
  const rest = text.replace(/\(([^()]*)\)/g, (_, inner: string) => {
    if (inner.includes('@')) readHandles(inner, handles);
    else if (inner.trim()) aliases.push(inner.trim());
    return ' | ';
  });

  let platforms: string[] = [];
  const details: string[] = [];
  const segments = rest
    .split(SPLIT_RE)
    .map((s) => s.replace(/^[-–—\s]+|[-–—\s]+$/g, '').trim())
    .filter(Boolean);
  segments.forEach((seg, i) => {
    if (i === 0 && firstParen > 0 && seg === name) return;
    if (seg.includes('@')) {
      readHandles(seg, handles);
      return;
    }
    const found = platformsIn(seg);
    if (found.length && !platforms.length) {
      platforms = found;
      return;
    }
    if (i === 0 && !name) {
      name = seg;
      return;
    }
    details.push(seg);
  });

  const qualified = [...handles.byPlatform.keys()];
  if (!platforms.length) platforms = qualified;
  const anyHandle = handles.general[0] ?? [...handles.byPlatform.values()][0];
  // A roster line names a creator on a platform: needs a handle, or a name plus a platform.
  if (!anyHandle && !(name && platforms.length)) return null;

  name = name.replace(/[\s:–—-]+$/, '').trim() || anyHandle || '';
  const detailText = details.join(' · ');
  const placement = detailText ? placementOf(detailText) : '';

  const rows: DumpRow[] = (platforms.length ? platforms : ['']).map((platform) => {
    const flags: string[] = [];
    let handle = (platform && handles.byPlatform.get(platform)) || handles.general[0] || '';
    if (!handle && anyHandle) {
      handle = anyHandle;
      flags.push(`No ${platformName(platform)} handle given, so @${anyHandle} is used. Confirm it.`);
    }
    if (!handle) flags.push('No handle given.');
    if (!platform) flags.push('No platform given.');
    if (!placement) flags.push('No placement given (link in bio, description…).');
    if (struck) flags.unshift('Struck through in the paste, so it’s left out. Tick it to include it.');
    return {
      values: {
        name,
        handle,
        platform,
        placement,
        details: detailText,
        ...(aliases.length ? { alias: aliases.join(', ') } : {}),
      },
      include: !struck,
      flags,
    };
  });
  return rows;
}

function parseRoster(lines: string[]): ParsedDump {
  const rows: DumpRow[] = [];
  const ignored: string[] = [];
  for (const line of lines) {
    const parsed = parseRosterLine(line);
    if (parsed) rows.push(...parsed);
    else ignored.push(line);
  }
  const columns = ['name', 'handle', 'platform', 'placement', 'details'];
  if (rows.some((r) => r.values.alias)) columns.push('alias');
  rows.forEach((r) => columns.forEach((c) => (r.values[c] ??= '')));
  return { kind: 'roster', columns, rows, ignored };
}

// ---------- Entry point ----------

export function parseDump(text: string): ParsedDump {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '');
  if (!lines.length) return { kind: 'empty', columns: [], rows: [], ignored: [] };

  if (looksLikeTable(lines)) return tableFromCells(parseDelimited(lines.join('\n')));

  const rosterish = lines.filter((l) => /@[A-Za-z0-9._]+/.test(l) || (platformsIn(l).length > 0 && SPLIT_RE.test(l)));
  if (rosterish.length >= Math.max(1, lines.length / 2) || rosterish.length >= 3) return parseRoster(lines);

  return {
    kind: 'list',
    columns: ['value'],
    rows: lines.map((l) => ({ values: { value: l.replace(BULLET_RE, '').trim() }, include: true, flags: [] })),
    ignored: [],
  };
}

/**
 * Rich-text paste (Slack, Docs, Notion) loses strikethrough when it becomes plain text. This
 * reads the HTML version of the clipboard instead and wraps struck-through text in ~~ ~~ so the
 * roster parser can leave those lines out.
 */
export function htmlToDumpText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'BR', 'UL', 'OL', 'TABLE']);
  const out: string[] = [];
  const walk = (node: Node, struck: boolean): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.textContent ?? '');
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === 'BR') {
      out.push('\n');
      return;
    }
    const style = node.getAttribute('style') ?? '';
    const strikes = !struck && (['S', 'DEL', 'STRIKE'].includes(node.tagName) || /line-through/.test(style));
    if (node.tagName === 'TD' || node.tagName === 'TH') {
      if (node.previousElementSibling) out.push('\t');
    }
    if (strikes) out.push('~~');
    node.childNodes.forEach((c) => walk(c, struck || strikes));
    if (strikes) out.push('~~');
    if (blocks.has(node.tagName)) out.push('\n');
  };
  walk(doc.body, false);
  return out
    .join('')
    .replace(/~~(\s*)~~/g, '$1')
    .split('\n')
    .map((l) => l.replace(/[  ]+/g, ' ').trim())
    .map((l) => {
      // "~~Hannah Wilson (@h) - IG~~" may come through as text around the marks; keep marks at the ends.
      const m = l.match(/^(?:[*\-•]\s*)?~~([\s\S]*)~~$/);
      return m ? `~~${m[1].trim()}~~` : l;
    })
    .filter((l, i, all) => l !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n')
    .trim();
}
