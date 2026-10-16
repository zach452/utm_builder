import { channelOf, SOURCE_ALIASES } from '../config/channels';
import { PARAM_KEYS, PARAMS, type ParamKey, type Params } from '../config/params';

/**
 * Platform macros: {{ad.name}} (Meta, Snapchat, LinkedIn), {keyword} (Google, Microsoft,
 * Pinterest) and __CID__ (TikTok). They are kept exactly as written; the platform swaps them
 * for the real value at click time.
 */
const MACRO_RE = /(\{\{[^{}]+\}\}|\{[^{}]+\}|__[A-Z][A-Z0-9_]*?__)/g;

export const hasMacro = (value: string): boolean => new RegExp(MACRO_RE.source).test(value);

/** Lowercase, underscores for spaces, nothing that needs URL-encoding. */
function normalizeLiteral(raw: string): string {
  return raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/@/g, '')
    .replace(/[\s/\\|+,:;]+/g, '_')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/_*-_*/g, '-');
}

/** Normalizes a value, leaving any platform macros inside it untouched. */
export function normalizeValue(raw: string): string {
  const parts = raw.trim().split(MACRO_RE);
  const out = parts
    .map((part, i) => (i % 2 === 1 ? part : normalizeLiteral(part)))
    .join('');
  // Only trim separators at the very ends, so `__CID__` and `lillian__chiu` survive.
  return hasMacro(out) ? out : out.replace(/^[._-]+|[._-]+$/g, '');
}

export function normalizeParam(key: ParamKey, raw: string): string {
  const value = normalizeValue(raw);
  if (key === 'utm_source') return SOURCE_ALIASES[value] ?? value;
  return value;
}

export function normalizeParams(params: Params): Params {
  const out: Params = {};
  for (const key of PARAM_KEYS) {
    const v = params[key];
    if (v && v.trim()) {
      const n = normalizeParam(key, v);
      if (n) out[key] = n;
    }
  }
  return out;
}

/** The query string on its own, in the fixed parameter order. Values must already be normalized. */
export function buildQuery(params: Params): string {
  return PARAM_KEYS.filter((k) => params[k])
    .map((k) => `${k}=${params[k]}`)
    .join('&');
}

export interface Destination {
  /** The destination as typed, cleaned up: scheme added, existing utm_* removed. */
  base: string;
  error?: string;
  warnings: string[];
}

const STORE_HOSTS = /(^|\.)(apps\.apple\.com|itunes\.apple\.com|play\.google\.com)$/;

export function parseDestination(raw: string): Destination {
  const warnings: string[] = [];
  let input = raw.trim();
  if (!input) return { base: '', error: 'Add a destination URL.', warnings };
  if (hasMacro(input) && /^\{/.test(input)) {
    return { base: input, error: 'Put the real landing page here; macros belong in the fields below.', warnings };
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
    input = `https://${input}`;
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { base: raw.trim(), error: 'That isn’t a valid URL.', warnings };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { base: raw.trim(), error: 'Use an http(s) URL.', warnings };
  }
  if (!url.hostname.includes('.')) {
    return { base: raw.trim(), error: 'That isn’t a valid URL.', warnings };
  }
  if (url.protocol === 'http:') warnings.push('Destination is http, not https.');
  if (STORE_HOSTS.test(url.hostname)) {
    warnings.push(
      'App store links drop UTMs. Use a web page, or the store’s own campaign link (App Store: pt/ct, Google Play: referrer).',
    );
  }
  const stripped = [...url.searchParams.keys()].filter((k) => k.toLowerCase().startsWith('utm_'));
  if (stripped.length) {
    stripped.forEach((k) => url.searchParams.delete(k));
    warnings.push(`Replaced the ${stripped.join(', ')} already on the destination.`);
  }
  return { base: url.toString(), warnings };
}

/** Destination + UTMs. Existing non-UTM params and the #fragment are kept. */
export function joinUrl(base: string, query: string): string {
  if (!query) return base;
  const hashAt = base.indexOf('#');
  const head = hashAt === -1 ? base : base.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : base.slice(hashAt);
  const sep = head.includes('?') ? (head.endsWith('?') || head.endsWith('&') ? '' : '&') : '?';
  return `${head}${sep}${query}${hash}`;
}

export type Severity = 'error' | 'warning';
export interface Issue {
  severity: Severity;
  message: string;
  param?: ParamKey;
}

export interface BuiltLink {
  url: string;
  base: string;
  query: string;
  params: Params;
  issues: Issue[];
  ok: boolean;
}

/** Builds a link and checks it against the channel's conventions. */
export function buildLink(channelId: string, destination: string, raw: Params): BuiltLink {
  const channel = channelOf(channelId);
  const dest = parseDestination(destination);
  const params = normalizeParams(raw);
  const issues: Issue[] = [];

  if (dest.error) issues.push({ severity: 'error', message: dest.error });
  dest.warnings.forEach((message) => issues.push({ severity: 'warning', message }));

  const required = new Set<ParamKey>([
    ...PARAM_KEYS.filter((k) => PARAMS[k].required),
    ...(channel.required ?? []),
  ]);
  for (const key of required) {
    if (!params[key]) issues.push({ severity: 'error', param: key, message: `${PARAMS[key].label} is required.` });
  }

  const expectedMedium = channel.defaults.utm_medium;
  if (expectedMedium && params.utm_medium && params.utm_medium !== expectedMedium) {
    issues.push({
      severity: 'warning',
      param: 'utm_medium',
      message: `${channel.label} links normally use medium “${expectedMedium}”. A different medium splits this channel in reporting.`,
    });
  }

  for (const key of PARAM_KEYS) {
    const v = raw[key];
    if (v && /\[[^\]]+\]/.test(v)) {
      issues.push({ severity: 'error', param: key, message: `${PARAMS[key].label} still has a [column] placeholder.` });
    }
  }

  const query = buildQuery(params);
  const url = dest.error ? '' : joinUrl(dest.base, query);
  return { url, base: dest.base, query, params, issues, ok: !issues.some((i) => i.severity === 'error') };
}

/** Reads UTMs back out of a tagged URL, e.g. to start a new link from an old one. */
export function splitTaggedUrl(tagged: string): { base: string; params: Params } {
  const params: Params = {};
  const dest = parseDestination(tagged);
  try {
    const url = new URL(tagged.includes('://') ? tagged : `https://${tagged}`);
    for (const key of PARAM_KEYS) {
      const v = url.searchParams.get(key);
      if (v) params[key] = v;
    }
  } catch {
    // Not a URL: nothing to read.
  }
  return { base: dest.base, params };
}
