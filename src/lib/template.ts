/** A row of pasted data, keyed by normalized column name. */
export type Row = Record<string, string>;

/** "Creator Name" → "creator_name", so [creator_name] and [Creator Name] both work. */
export const columnKey = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const TOKEN_RE = /\[([^\]]+)\]/g;

/** Replaces [column] tokens with the row's values. Unknown or empty columns are reported. */
export function fillTemplate(template: string, row: Row): { value: string; missing: string[] } {
  const missing: string[] = [];
  const value = template.replace(TOKEN_RE, (token, name: string) => {
    const v = row[columnKey(name)];
    if (v === undefined || v.trim() === '') {
      missing.push(columnKey(name));
      return token;
    }
    return v.trim();
  });
  return { value, missing };
}

export const tokensIn = (template: string): string[] =>
  [...template.matchAll(TOKEN_RE)].map((m) => columnKey(m[1]));
