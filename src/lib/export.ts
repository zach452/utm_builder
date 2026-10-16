import { PARAM_KEYS } from '../config/params';
import type { LinkRecord } from './types';

/** The subset of a link that exports need, so unsaved bulk rows can be exported too. */
export type ExportLink = Pick<LinkRecord, 'url' | 'label' | 'params' | 'channel'> &
  Partial<Pick<LinkRecord, 'batchName' | 'createdBy' | 'team' | 'createdAt' | 'notes' | 'status'>>;

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(links: ExportLink[]): string {
  const header = ['label', 'url', ...PARAM_KEYS, 'channel', 'batch', 'created_by', 'team', 'created_at', 'status', 'notes'];
  const rows = links.map((l) => [
    l.label,
    l.url,
    ...PARAM_KEYS.map((k) => l.params[k] ?? ''),
    l.channel,
    l.batchName ?? '',
    l.createdBy ?? '',
    l.team ?? '',
    l.createdAt ?? '',
    l.status ?? '',
    l.notes ?? '',
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

/**
 * Slack-ready list. Labels like "Olivia Zhang · tiktok" are grouped under the creator:
 *   *Olivia Zhang*
 *   • TikTok: https://…
 */
export function toSlack(links: ExportLink[]): string {
  const groups = new Map<string, { suffix: string; url: string }[]>();
  for (const l of links) {
    const label = l.label || l.url;
    const at = label.lastIndexOf(' · ');
    const head = at === -1 ? label : label.slice(0, at);
    const suffix = at === -1 ? '' : label.slice(at + 3);
    if (!groups.has(head)) groups.set(head, []);
    groups.get(head)!.push({ suffix, url: l.url });
  }
  const pretty = (s: string) => PRETTY[s] ?? s;
  return [...groups.entries()]
    .map(([head, items]) =>
      items.length === 1 && !items[0].suffix
        ? `• *${head}*: ${items[0].url}`
        : [`*${head}*`, ...items.map((i) => `• ${pretty(i.suffix) || 'Link'}: ${i.url}`)].join('\n'),
    )
    .join('\n\n');
}

const PRETTY: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  x: 'X',
  threads: 'Threads',
  pinterest: 'Pinterest',
  snapchat: 'Snapchat',
};

export function download(filename: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
