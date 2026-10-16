import { useMemo, useRef, useState, type ClipboardEvent } from 'react';
import exampleRoster from '../../examples/hark-creators-oct-2026.txt?raw';
import { APP } from '../config/app';
import { channelOf } from '../config/channels';
import { PARAM_KEYS, PARAMS, type ParamKey, type Params } from '../config/params';
import { Badge, Card, ChannelSelect, CopyButton, Field, Notice, UrlText } from '../components/ui';
import { htmlToDumpText, parseDelimited, parseDump, tableFromCells, type ParsedDump } from '../lib/dump';
import { download, toCsv, toSlack } from '../lib/export';
import { fillTemplate } from '../lib/template';
import type { NewLink } from '../lib/types';
import { buildLink, hasMacro, type BuiltLink } from '../lib/utm';
import type { Identity } from '../state/identity';
import { useLibrary } from '../state/library';
import { autoLabel } from './BuildView';

type Templates = Params & { label?: string };

export interface BulkState {
  text: string;
  fileName: string | null;
  dump: ParsedDump;
  channel: string;
  destination: string;
  /** null = use the suggested name. */
  batchName: string | null;
  templates: Templates;
}

const EMPTY_DUMP: ParsedDump = { kind: 'empty', columns: [], rows: [], ignored: [] };

export const newBulkState = (): BulkState => ({
  text: '',
  fileName: null,
  dump: EMPTY_DUMP,
  channel: 'creator',
  destination: APP.destinations[0]?.url ?? '',
  batchName: null,
  templates: templatesFor('creator', EMPTY_DUMP),
});

/** Column names that map straight onto a parameter when a table is pasted. */
const COLUMN_ALIASES: Record<ParamKey | 'destination' | 'label', string[]> = {
  utm_source: ['utm_source', 'source', 'platform', 'network'],
  utm_medium: ['utm_medium', 'medium'],
  utm_campaign: ['utm_campaign', 'campaign', 'campaign_name'],
  utm_content: ['utm_content', 'content', 'handle', 'creator_handle', 'username'],
  utm_term: ['utm_term', 'term', 'keyword', 'placement'],
  utm_adgroup: ['utm_adgroup', 'ad_group', 'adgroup', 'ad_set', 'adset'],
  utm_ad: ['utm_ad', 'ad', 'ad_name'],
  utm_creative: ['utm_creative', 'creative'],
  utm_usecase: ['utm_usecase', 'use_case', 'usecase'],
  destination: ['url', 'destination', 'destination_url', 'landing_page', 'link', 'base_url'],
  label: ['label', 'name', 'creator', 'creator_name', 'partner', 'title'],
};

const findColumn = (columns: string[], names: string[]) => names.find((n) => columns.includes(n));

/** Channel defaults, then the channel's bulk templates, then any columns named like a parameter. */
export function templatesFor(channelId: string, dump: ParsedDump): Templates {
  const channel = channelOf(channelId);
  const cols = dump.columns;
  const out: Templates = { ...channel.defaults };
  const usable = (template: string) => [...template.matchAll(/\[([^\]]+)\]/g)].every((m) => cols.includes(m[1]));
  for (const [k, v] of Object.entries(channel.bulk ?? {})) {
    if (v && cols.length && usable(v)) out[k as keyof Templates] = v;
  }
  if (dump.kind === 'table') {
    for (const k of [...PARAM_KEYS, 'label'] as const) {
      const col = findColumn(cols, COLUMN_ALIASES[k]);
      if (col && !(k === 'utm_content' && out.utm_content?.startsWith('['))) out[k] = `[${col}]`;
    }
  }
  if (dump.kind === 'list') {
    out.utm_content = '[value]';
    out.label = '[value]';
  }
  return out;
}

function destinationFor(dump: ParsedDump, fallback: string): string {
  const col = dump.kind === 'table' ? findColumn(dump.columns, COLUMN_ALIASES.destination) : undefined;
  return col ? `[${col}]` : fallback.startsWith('[') ? APP.destinations[0]?.url ?? '' : fallback;
}

const monthYear = () => new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

interface ComputedRow {
  index: number;
  include: boolean;
  label: string;
  built: BuiltLink;
  status: 'new' | 'existing' | 'duplicate' | 'error' | 'skipped';
  flags: string[];
}

export function BulkView({
  state,
  setState,
  ensureIdentity,
  onOpenLibrary,
}: {
  state: BulkState;
  setState: (s: BulkState | ((prev: BulkState) => BulkState)) => void;
  ensureIdentity: () => Promise<Identity | null>;
  onOpenLibrary: (batchName?: string) => void;
}) {
  const library = useLibrary();
  const fileRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState<keyof Templates | 'destination'>('utm_content');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: 'good' | 'info' | 'bad'; text: string; batch?: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const channel = channelOf(state.channel);
  const { dump } = state;
  const batchName =
    state.batchName ?? (dump.kind === 'roster' ? `Creators · ${monthYear()}` : `${channel.label} · ${monthYear()}`);

  const loadDump = (next: ParsedDump, extra: Partial<BulkState>) => {
    setResult(null);
    setState((prev) => {
      const channelId = next.kind === 'roster' && !channelOf(prev.channel).bulk ? 'creator' : prev.channel;
      return {
        ...prev,
        ...extra,
        dump: next,
        channel: channelId,
        destination: destinationFor(next, prev.destination),
        templates: templatesFor(channelId, next),
      };
    });
  };

  const onText = (text: string) => loadDump(parseDump(text), { text, fileName: null });

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData('text/html');
    if (!html || !/<(s|del|strike)\b|line-through/i.test(html)) return;
    e.preventDefault();
    const ta = e.currentTarget;
    const insert = htmlToDumpText(html);
    onText(ta.value.slice(0, ta.selectionStart) + insert + ta.value.slice(ta.selectionEnd));
  };

  const onFile = async (file: File) => {
    setFileError(null);
    try {
      let cells: unknown[][];
      if (/\.xlsx$/i.test(file.name)) {
        const { default: readExcelFile } = await import('read-excel-file/browser');
        const sheets = await readExcelFile(file);
        cells = (sheets.find((s) => s.data.length > 1) ?? sheets[0])?.data ?? [];
      } else if (/\.(csv|tsv|txt)$/i.test(file.name)) {
        const text = await file.text();
        if (/\.txt$/i.test(file.name)) return onText(text);
        cells = parseDelimited(text, /\.tsv$/i.test(file.name) ? '\t' : undefined);
      } else {
        setFileError('Upload a .csv, .tsv, .txt or .xlsx file.');
        return;
      }
      loadDump(tableFromCells(cells), { text: '', fileName: file.name });
    } catch (err) {
      setFileError(`Couldn't read ${file.name}: ${(err as Error).message}`);
    }
  };

  const setCell = (row: number, col: string, value: string) =>
    setState((prev) => ({
      ...prev,
      dump: {
        ...prev.dump,
        rows: prev.dump.rows.map((r, i) => (i === row ? { ...r, values: { ...r.values, [col]: value } } : r)),
      },
    }));

  const setInclude = (row: number, include: boolean) =>
    setState((prev) => ({
      ...prev,
      dump: { ...prev.dump, rows: prev.dump.rows.map((r, i) => (i === row ? { ...r, include } : r)) },
    }));

  const addRow = () =>
    setState((prev) => {
      const columns = prev.dump.columns.length ? prev.dump.columns : ['value'];
      return {
        ...prev,
        dump: {
          ...prev.dump,
          kind: prev.dump.kind === 'empty' ? 'list' : prev.dump.kind,
          columns,
          rows: [...prev.dump.rows, { values: Object.fromEntries(columns.map((c) => [c, ''])), include: true, flags: [] }],
        },
      };
    });

  const setTemplate = (k: keyof Templates, v: string) => setState((prev) => ({ ...prev, templates: { ...prev.templates, [k]: v } }));

  const insertColumn = (col: string) => {
    if (focused === 'destination') {
      setState((prev) => ({ ...prev, destination: `[${col}]` }));
      return;
    }
    const current = state.templates[focused] ?? '';
    const replace = !current || !current.includes('[') || (focused !== 'label' && current === channel.defaults[focused]);
    setTemplate(focused, replace ? `[${col}]` : `${current}_[${col}]`);
  };

  const rows: ComputedRow[] = useMemo(() => {
    const seen = new Set<string>();
    return dump.rows.map((r, index) => {
      const raw: Params = {};
      for (const k of PARAM_KEYS) {
        const t = state.templates[k];
        if (t) raw[k] = fillTemplate(t, r.values).value;
      }
      const dest = fillTemplate(state.destination, r.values).value;
      const built = buildLink(state.channel, dest, raw);
      const labelTemplate = state.templates.label?.trim();
      const label = (labelTemplate ? fillTemplate(labelTemplate, r.values).value.replace(/\[[^\]]+\]/g, '').replace(/^[\s·]+|[\s·]+$/g, '') : '') || autoLabel(built.params);
      let status: ComputedRow['status'] = 'new';
      if (!r.include) status = 'skipped';
      else if (!built.ok) status = 'error';
      else if (seen.has(built.url)) status = 'duplicate';
      else if (library.byUrl.get(built.url)?.status === 'active') status = 'existing';
      if (r.include && built.ok) seen.add(built.url);
      return { index, include: r.include, label, built, status, flags: r.flags };
    });
  }, [dump.rows, state.templates, state.destination, state.channel, library.byUrl]);

  const counts = {
    new: rows.filter((r) => r.status === 'new').length,
    existing: rows.filter((r) => r.status === 'existing').length,
    duplicate: rows.filter((r) => r.status === 'duplicate').length,
    error: rows.filter((r) => r.status === 'error').length,
    skipped: rows.filter((r) => r.status === 'skipped').length,
  };
  const ready = rows.filter((r) => r.status === 'new' || r.status === 'existing');
  const exportLinks = ready.map((r) => ({ url: r.built.url, label: r.label, params: r.built.params, channel: state.channel, batchName }));

  const save = async () => {
    const who = await ensureIdentity();
    if (!who) return;
    setSaving(true);
    setResult(null);
    try {
      const links: NewLink[] = ready.map((r) => ({
        url: r.built.url,
        baseUrl: r.built.base,
        params: r.built.params,
        channel: state.channel,
        label: r.label,
        notes: r.flags.filter((f) => !/^Struck/.test(f)).join(' '),
        createdBy: who.name,
        team: who.team,
      }));
      const res = await library.save(links, batchName);
      setResult({
        tone: 'good',
        text: `Saved ${res.created.length} new link${res.created.length === 1 ? '' : 's'}${
          res.existing.length ? `; ${res.existing.length} ${res.existing.length === 1 ? 'was' : 'were'} already in the library` : ''
        }.`,
        batch: res.created.length > 1 ? batchName : undefined,
      });
    } catch (err) {
      setResult({ tone: 'bad', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const kindSummary = () => {
    const included = dump.rows.filter((r) => r.include).length;
    if (dump.kind === 'roster') {
      const creators = new Set(dump.rows.filter((r) => r.include).map((r) => r.values.name)).size;
      return `Read as a creator list: ${creators} creator${creators === 1 ? '' : 's'} → ${included} link${included === 1 ? '' : 's'} (one per platform).`;
    }
    if (dump.kind === 'table') return `Read as a table${state.fileName ? ` from ${state.fileName}` : ''}: ${dump.rows.length} rows, columns ${dump.columns.join(', ')}.`;
    if (dump.kind === 'list') return `Read as a list: ${dump.rows.length} item${dump.rows.length === 1 ? '' : 's'}. Put [value] in whichever field the list is for.`;
    return null;
  };

  // Columns the templates use are editable; the rest fold into one compact "Other" column.
  const referenced = new Set(
    [...Object.values(state.templates), state.destination].flatMap((t) => [...(t ?? '').matchAll(/\[([^\]]+)\]/g)].map((m) => m[1])),
  );
  const editCols = dump.columns.some((c) => referenced.has(c)) ? dump.columns.filter((c) => referenced.has(c)) : dump.columns;
  const otherCols = dump.columns.filter((c) => !editCols.includes(c));
  // Size each column to its longest value so names and handles aren't cut off.
  const widths = Object.fromEntries(
    editCols.map((c) => [c, Math.min(20, Math.max(5, c.length, ...dump.rows.map((r) => Math.ceil((r.values[c] ?? '').length * 0.8) + 1)))]),
  );

  const templateKeys: ParamKey[] = [...channel.fields, ...PARAM_KEYS.filter((k) => !channel.fields.includes(k) && state.templates[k])];

  return (
    <div className="stack">
      <Card
        title="1. Paste or upload"
        subtitle="A creator list from Slack, rows copied from a spreadsheet, a CSV or Excel file, or a plain list. Each line or row becomes a link."
        actions={
          <>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Upload CSV / Excel
            </button>
            <button type="button" className="btn" onClick={() => onText(exampleRoster)}>
              Try the Hark creator list
            </button>
            {(state.text || state.fileName) && (
              <button type="button" className="btn" onClick={() => setState(newBulkState())}>
                Start over
              </button>
            )}
          </>
        }
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
        <label htmlFor="dump" className="sr-only">
          Paste anything
        </label>
        <textarea
          id="dump"
          className="dump"
          rows={state.text ? 10 : 7}
          value={state.text}
          onChange={(e) => onText(e.target.value)}
          onPaste={onPaste}
          onDrop={(e) => {
            const f = e.dataTransfer.files?.[0];
            if (f) {
              e.preventDefault();
              void onFile(f);
            }
          }}
          placeholder={
            state.fileName
              ? `Loaded ${state.fileName}. Paste here to replace it.`
              : 'Paste here, e.g.\n* Olivia Zhang (IG @oliviazhangofficial, TT @livviazhang) - TikTok and IG - link in bio\n\nor rows copied from Google Sheets with a header row (campaign, content, url…)'
          }
        />
        {fileError && <Notice tone="bad">{fileError}</Notice>}
        {kindSummary() && (
          <p className="parse-summary">
            <Badge tone="info">{dump.kind}</Badge> {kindSummary()}
            {counts.skipped > 0 && ` ${counts.skipped} struck through or unticked, so left out.`}
          </p>
        )}
        {dump.ignored.length > 0 && (
          <p className="muted small">
            Ignored {dump.ignored.length} line{dump.ignored.length === 1 ? '' : 's'} that didn’t look like a link request: “
            {dump.ignored[0].slice(0, 80)}
            {dump.ignored[0].length > 80 ? '…' : ''}”{dump.ignored.length > 1 ? ` and ${dump.ignored.length - 1} more` : ''}.
          </p>
        )}
      </Card>

      {dump.kind !== 'empty' && (
        <Card
          title="2. How each link is built"
          subtitle="Fixed values apply to every row. [column] pulls from that row. Click a column below to drop it into the field you're editing."
        >
          <div className="fields three">
            <div className="field">
              <label htmlFor="bulk-channel">Channel</label>
              <ChannelSelect
                id="bulk-channel"
                value={state.channel}
                onChange={(id) =>
                  setState((prev) => ({ ...prev, channel: id, templates: templatesFor(id, prev.dump) }))
                }
              />
            </div>
            <Field
              label="Destination URL"
              required
              value={state.destination}
              onChange={(v) => setState((prev) => ({ ...prev, destination: v }))}
              onFocus={() => setFocused('destination')}
              suggestions={[...APP.destinations.map((d) => d.url), ...library.memory.destinations]}
              help="Same page for every row, or [url] if your paste has a URL column."
            />
            <Field
              label="Batch name"
              value={batchName}
              onChange={(v) => setState((prev) => ({ ...prev, batchName: v }))}
              suggestions={library.memory.batches}
              help="Groups these links in the library."
            />
          </div>

          <div className="columns-bar">
            <span className="muted small">Columns:</span>
            {dump.columns.map((c) => (
              <button key={c} type="button" className="chip" onClick={() => insertColumn(c)} title={`Insert [${c}]`}>
                [{c}]
              </button>
            ))}
          </div>

          <div className="fields templates">
            {templateKeys.map((k) => (
              <Field
                key={k}
                label={PARAMS[k].label}
                required={PARAMS[k].required || channel.required?.includes(k)}
                value={state.templates[k] ?? ''}
                onChange={(v) => setTemplate(k, v)}
                onFocus={() => setFocused(k)}
                mono={hasMacro(state.templates[k] ?? '') || /\[/.test(state.templates[k] ?? '')}
                suggestions={[...dump.columns.map((c) => `[${c}]`), ...(channel.options?.[k] ?? []), ...library.memory.params[k]]}
              />
            ))}
            <Field
              label="Name in library"
              value={state.templates.label ?? ''}
              onChange={(v) => setTemplate('label', v)}
              onFocus={() => setFocused('label')}
              placeholder="e.g. [name] · [platform]"
              mono
            />
          </div>
        </Card>
      )}

      {dump.rows.length > 0 && (
        <Card
          title="3. Review and save"
          subtitle={
            <>
              <Badge tone="good">{counts.new} new</Badge> <Badge tone="info">{counts.existing} already in library</Badge>{' '}
              {counts.error > 0 && <Badge tone="bad">{counts.error} need fixing</Badge>}{' '}
              {counts.duplicate > 0 && <Badge tone="warn">{counts.duplicate} duplicate</Badge>}{' '}
              {counts.skipped > 0 && <Badge>{counts.skipped} left out</Badge>}
            </>
          }
          actions={
            <>
              <CopyButton text={ready.map((r) => `${r.label}\t${r.built.url}`).join('\n')} label="Copy for Sheets" />
              <CopyButton text={toSlack(exportLinks)} label="Copy for Slack" />
              <button type="button" className="btn" disabled={!ready.length} onClick={() => download(`${batchName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`, toCsv(exportLinks))}>
                Download CSV
              </button>
              {library.storage === 'database' && (
                <button type="button" className="btn btn-primary" disabled={!counts.new || saving} onClick={save}>
                  {saving ? 'Saving…' : `Save ${counts.new} to library`}
                </button>
              )}
            </>
          }
        >
          {library.storage === 'none' && <Notice tone="warn">Saving is off until a database is connected. Copy or download the links instead.</Notice>}
          {result && (
            <Notice tone={result.tone}>
              {result.text}{' '}
              {result.tone === 'good' && (
                <button type="button" className="btn-link" onClick={() => onOpenLibrary(result.batch)}>
                  View in library
                </button>
              )}
            </Notice>
          )}
          <div className="table-wrap">
            <table className="table bulk-table">
              <thead>
                <tr>
                  <th className="col-check">
                    <span className="sr-only">Include</span>
                  </th>
                  {editCols.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                  {otherCols.length > 0 && <th>Other</th>}
                  <th className="col-url">Link</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.index} className={`status-${r.status}`}>
                    <td className="col-check">
                      <input
                        type="checkbox"
                        aria-label={`Include ${r.label}`}
                        checked={r.include}
                        onChange={(e) => setInclude(r.index, e.target.checked)}
                      />
                    </td>
                    {editCols.map((c) => (
                      <td key={c}>
                        <input
                          className="cell-input"
                          size={widths[c]}
                          aria-label={c}
                          value={dump.rows[r.index].values[c] ?? ''}
                          onChange={(e) => setCell(r.index, c, e.target.value)}
                          spellCheck={false}
                        />
                      </td>
                    ))}
                    {otherCols.length > 0 && (
                      <td className="col-other muted small">
                        {otherCols
                          .filter((c) => dump.rows[r.index].values[c])
                          .map((c) => (
                            <div key={c}>{dump.rows[r.index].values[c]}</div>
                          ))}
                      </td>
                    )}
                    <td className="col-url">
                      {r.built.url ? (
                        <div className="url-cell">
                          <UrlText url={r.built.url} />
                          <CopyButton text={r.built.url} label="Copy" className="btn btn-small" disabled={!r.built.ok} />
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="col-status">
                      <StatusBadge status={r.status} />
                      {r.include &&
                        [...r.built.issues.map((i) => i.message), ...r.flags].map((m) => (
                          <div key={m} className="row-issue">
                            {m}
                          </div>
                        ))}
                      {!r.include && r.flags[0] && <div className="row-issue muted">{r.flags[0]}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-link" onClick={addRow}>
            + Add a row
          </button>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ComputedRow['status'] }) {
  switch (status) {
    case 'new':
      return <Badge tone="good">New</Badge>;
    case 'existing':
      return <Badge tone="info">In library</Badge>;
    case 'duplicate':
      return <Badge tone="warn">Duplicate row</Badge>;
    case 'error':
      return <Badge tone="bad">Needs fixing</Badge>;
    default:
      return <Badge>Left out</Badge>;
  }
}
