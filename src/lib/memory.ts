import { PARAM_KEYS, type ParamKey } from '../config/params';
import type { LinkRecord } from './types';

/**
 * What the team has already used, most-used first. Every field offers these as suggestions,
 * so the fifth person to build a TikTok link types the same campaign name as the first.
 */
export interface Memory {
  params: Record<ParamKey, string[]>;
  destinations: string[];
  batches: string[];
}

const ranked = (counts: Map<string, number>): string[] =>
  [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([v]) => v);

export function buildMemory(links: LinkRecord[]): Memory {
  const params = Object.fromEntries(PARAM_KEYS.map((k) => [k, new Map<string, number>()])) as Record<ParamKey, Map<string, number>>;
  const destinations = new Map<string, number>();
  const batches = new Map<string, number>();
  for (const l of links) {
    for (const k of PARAM_KEYS) {
      const v = l.params[k];
      if (v) params[k].set(v, (params[k].get(v) ?? 0) + 1);
    }
    destinations.set(l.baseUrl, (destinations.get(l.baseUrl) ?? 0) + 1);
    if (l.batchName) batches.set(l.batchName, (batches.get(l.batchName) ?? 0) + 1);
  }
  return {
    params: Object.fromEntries(PARAM_KEYS.map((k) => [k, ranked(params[k])])) as Record<ParamKey, string[]>,
    destinations: ranked(destinations),
    batches: ranked(batches),
  };
}

/** Channel options first, then the team's own values, no repeats. */
export const suggestionsFor = (...lists: (string[] | undefined)[]): string[] => [...new Set(lists.flatMap((l) => l ?? []))];
