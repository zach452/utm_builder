import { CHANNEL_BY_ID as CHANNEL_INDEX, channelOf, SOURCE_ALIASES } from '../config/channels';
import { CAMPAIGN, PARAM_KEYS, PARAMS, type ParamKey, type Params } from '../config/params';

/**
 * Platform macros: {{ad.id}} (Meta, Snapchat, LinkedIn), {campaignid} (Google, Microsoft,
 * Pinterest) and __CID__ (TikTok). They are kept exactly as written; the platform swaps them
 * for the real value at click time.
 */
const MACRO_RE = /(\{\{[^{}]+\}\}|\{[^{}]+\}|__[A-Z][A-Z0-9_]*?__)/g;

export const hasMacro = (value: string): boolean => new RegExp(MACRO_RE.source).test(value);

/** Applies `fn` to the text between macros, leaving the macros untouched. */
const mapLiterals = (value: string, fn: (literal: string) => string): string =>
  value
    .split(MACRO_RE)
    .map((part, i) => (i % 2 === 1 ? part : fn(part)))
    .join('');

/**
 * The schema's slug rule (utm_campaign, and every other lowercase field): trim, lowercase,
 * runs of anything outside a–z / 0–9 become one underscore, no underscores at the ends.
 * "US-Signup Food.202610" → "us_signup_food_202610".
 */
const slugCore = (raw: string): string =>
  raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/@/g, '')
    .replace(/[^a-z0-9]+/g, '_');

export const slugify = (raw: string): string => slugCore(raw).replace(/^_+|_+$/g, '');

/** slugify for values with macros in them: only the text around the macros is touched. */
function slugifyAroundMacros(value: string): string {
  const parts = value.split(MACRO_RE).map((part, i) => (i % 2 === 1 ? part : slugCore(part)));
  parts[0] = parts[0].replace(/^_+/, '');
  parts[parts.length - 1] = parts[parts.length - 1].replace(/_+$/, '');
  return parts.join('');
}

/** Hark keys: CT42, ct-0042 and "CT 0042" all become CT0042. */
function harkId(raw: string, prefix: string): string {
  const v = raw.toUpperCase().replace(/[\s_-]+/g, '');
  const m = v.match(/^([A-Z]+)(\d+)$/);
  return m && m[1] === prefix ? `${prefix}${m[2].padStart(4, '0')}` : v;
}

export function normalizeParam(key: ParamKey, raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  const def = PARAMS[key];
  switch (def.kind) {
    case 'slug': {
      const out = hasMacro(value) ? slugifyAroundMacros(value) : slugify(value);
      return key === 'utm_source' ? (SOURCE_ALIASES[out] ?? out) : out;
    }
    case 'term':
      return mapLiterals(value, (s) => s.toLowerCase().replace(/\s+/g, ' ')).trim();
    case 'hark_id':
      return harkId(value, def.prefix!);
    case 'site':
      return hasMacro(value) ? slugifyAroundMacros(value) : slugify(value);
    default:
      // Referral codes and platform IDs are kept exactly: case and leading zeros matter.
      return value;
  }
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

/** Macros stay raw so the platform can find them; everything else is URL-encoded. */
const encodeValue = (value: string): string => mapLiterals(value, encodeURIComponent);

/** The query string on its own, in the fixed parameter order. Values must already be normalized. */
export function buildQuery(params: Params): string {
  return PARAM_KEYS.filter((k) => params[k])
    .map((k) => `${k}=${encodeValue(params[k]!)}`)
    .join('&');
}

export interface Destination {
  /** The destination as typed, cleaned up: scheme added, existing tracking params removed. */
  base: string;
  error?: string;
  warnings: string[];
}

const STORE_HOSTS = /(^|\.)(apps\.apple\.com|itunes\.apple\.com|play\.google\.com)$/;

export function parseDestination(raw: string): Destination {
  const warnings: string[] = [];
  let input = raw.trim();
  if (!input) return { base: '', error: 'Add a destination URL.', warnings };
  if (/^\{/.test(input)) {
    return { base: input, error: 'Put the real landing page here; macros belong in the fields below.', warnings };
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) input = `https://${input}`;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { base: raw.trim(), error: 'That isn’t a valid URL.', warnings };
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname.includes('.')) {
    return { base: raw.trim(), error: 'That isn’t a valid URL.', warnings };
  }
  if (url.protocol === 'http:') warnings.push('Destination is http, not https.');
  if (STORE_HOSTS.test(url.hostname)) {
    warnings.push('App store links drop UTMs. Send people to a web page, or use the attribution provider’s link.');
  }
  if (url.hostname === 'example.com' || url.hostname.endsWith('.example.com')) {
    warnings.push('example.com is the schema’s placeholder. Use Hark’s real landing page.');
  }
  const stripped = [...url.searchParams.keys()].filter((k) => /^(utm|hark)_/i.test(k));
  if (stripped.length) {
    stripped.forEach((k) => url.searchParams.delete(k));
    warnings.push(`Replaced the ${stripped.join(', ')} already on the destination.`);
  }
  return { base: url.toString(), warnings };
}

/** Destination + tracking. Existing non-tracking params and the #fragment are kept. */
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

/** Checks one normalized value against the schema's format for its field. */
function checkValue(key: ParamKey, value: string): Issue | null {
  const def = PARAMS[key];
  if (value.length > def.max) return { severity: 'error', param: key, message: `${def.label} is over ${def.max} characters.` };
  if (/REPLACE_/i.test(value)) {
    return { severity: 'error', param: key, message: `${def.label} still has a REPLACE_ placeholder. Put in a real ID or macro, or leave it out.` };
  }
  switch (def.kind) {
    case 'slug':
      if (hasMacro(value)) {
        return { severity: 'warning', param: key, message: `${def.label} has a macro. The schema keeps it readable; macros go in the platform ID fields.` };
      }
      return null;
    case 'hark_id':
      return new RegExp(`^${def.prefix}[0-9]{4,}$`).test(value)
        ? null
        : { severity: 'error', param: key, message: `${def.label} must look like ${def.example} (${def.prefix} + at least 4 digits).` };
    default:
      return null;
  }
}

/** Builds a link and checks it against the schema and the channel's conventions. */
export function buildLink(channelId: string, destination: string, raw: Params): BuiltLink {
  const channel = channelOf(channelId);
  const dest = parseDestination(destination);
  const params = normalizeParams(raw);
  const issues: Issue[] = [];

  if (dest.error) issues.push({ severity: 'error', message: dest.error });
  dest.warnings.forEach((message) => issues.push({ severity: 'warning', message }));

  const required = new Set<ParamKey>([...PARAM_KEYS.filter((k) => PARAMS[k].required), ...(channel.required ?? [])]);
  for (const key of required) {
    if (!params[key]) issues.push({ severity: 'error', param: key, message: `${PARAMS[key].label} is required.` });
  }

  for (const key of PARAM_KEYS) {
    const v = raw[key];
    if (v && /\[[^\]]+\]/.test(v)) {
      issues.push({ severity: 'error', param: key, message: `${PARAMS[key].label} still has a [column] placeholder.` });
    } else if (params[key]) {
      const issue = checkValue(key, params[key]!);
      if (issue) issues.push(issue);
    }
  }

  const sources = channel.sources;
  if (sources && params.utm_source && !hasMacro(params.utm_source) && !sources.includes(params.utm_source)) {
    issues.push({
      severity: 'warning',
      param: 'utm_source',
      message: `The schema uses ${sources.join(', ')} as the source for ${channel.label}.`,
    });
  }
  const mediums = channel.mediums ?? (channel.defaults.utm_medium ? [channel.defaults.utm_medium] : []);
  if (mediums.length && params.utm_medium && !mediums.includes(params.utm_medium)) {
    issues.push({
      severity: 'warning',
      param: 'utm_medium',
      message: `${channel.label} links use medium ${mediums.join(' / ')}. A different medium splits this channel in reporting.`,
    });
  }
  if (params.utm_campaign && !hasMacro(params.utm_campaign) && !CAMPAIGN.pattern.test(params.utm_campaign)) {
    issues.push({
      severity: 'warning',
      param: 'utm_campaign',
      message: 'Hark campaigns are named {market}_{objective}_{theme}_{yyyymm}, e.g. us_signup_food_202610.',
    });
  }
  if (params.utm_term && !channel.fields.includes('utm_term')) {
    issues.push({ severity: 'warning', param: 'utm_term', message: 'Term is for paid search keywords only. Leave it out here.' });
  }
  if (channel.unlisted && channel.id !== 'other') {
    issues.push({
      severity: 'warning',
      message: `${channel.label.replace(/ \(proposed\)$/, '')} isn’t in the Hark schema yet. Hark keeps the link but flags its source / medium as unmapped, so agree it with Hark before using it.`,
    });
  }

  const query = buildQuery(params);
  const url = dest.error ? '' : joinUrl(dest.base, query);
  return { url, base: dest.base, query, params, issues, ok: !issues.some((i) => i.severity === 'error') };
}

/** Reads tracking params back out of a tagged URL, e.g. to start a new link from an old one. */
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

/**
 * True when a saved link still matches today's conventions: a known channel, only known
 * parameters, and rebuilding it gives the same URL with no errors and no field warnings (off-schema
 * source, medium, campaign name or term). Links built before the schema fail this.
 */
export function isCurrentFormat(link: { channel: string; baseUrl: string; params: Params; url: string }): boolean {
  if (!(link.channel in CHANNEL_INDEX)) return false;
  if (Object.keys(link.params).some((k) => !(PARAM_KEYS as readonly string[]).includes(k))) return false;
  const rebuilt = buildLink(link.channel, link.baseUrl, link.params);
  return rebuilt.ok && rebuilt.url === link.url && !rebuilt.issues.some((i) => i.param);
}
