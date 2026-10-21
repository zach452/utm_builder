import { useMemo, useRef, useState } from 'react';
import { Card, CopyButton, Field, formatDate, Notice } from '../components/ui';
import { parseDelimited, tableFromCells } from '../lib/dump';
import { download } from '../lib/export';
import type { CreatorRecord, NewCreator } from '../lib/types';
import { normalizeParam } from '../lib/utm';
import type { Identity } from '../state/identity';
import { useLibrary } from '../state/library';
import { SetupNotice } from './LibraryView';

const PLATFORMS = ['instagram', 'tiktok', 'youtube'];
const PLATFORM_NAMES: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' };

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function toCreatorsCsv(creators: CreatorRecord[]): string {
  const others = [...new Set(creators.flatMap((c) => Object.keys(c.handles)).filter((p) => !PLATFORMS.includes(p)))];
  const header = ['hark_creator_id', 'name', ...PLATFORMS, ...others, 'created_by', 'created_at'];
  const rows = creators.map((c) => [c.id, c.name, ...[...PLATFORMS, ...others].map((p) => c.handles[p] ?? ''), c.createdBy, c.createdAt]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

const ID_COLUMNS = ['hark_creator_id', 'creator_id', 'id'];
const NAME_COLUMNS = ['name', 'creator_name', 'creator'];
const PLATFORM_COLUMNS = ['instagram', 'ig', 'tiktok', 'tt', 'youtube', 'yt', 'x', 'twitter', 'threads', 'linkedin', 'facebook', 'snapchat', 'pinterest'];

/** Reads a creator list (e.g. a download from this tab, or Hark's own ID list) into registry entries. */
export function creatorsFromTable(cells: unknown[][]): NewCreator[] {
  const table = tableFromCells(cells);
  const idCol = ID_COLUMNS.find((c) => table.columns.includes(c));
  const nameCol = NAME_COLUMNS.find((c) => table.columns.includes(c));
  const platformCols = table.columns.filter((c) => PLATFORM_COLUMNS.includes(c));
  return table.rows
    .map(({ values }) => ({
      name: nameCol ? values[nameCol] : '',
      id: idCol ? values[idCol] || undefined : undefined,
      handles: Object.fromEntries(platformCols.filter((c) => values[c]).map((c) => [normalizeParam('utm_source', c), values[c]])),
    }))
    .filter((c) => c.name || Object.keys(c.handles).length);
}

/** The creator registry: one Hark creator ID per creator account, shared by all their links. */
export function CreatorsView({
  ensureIdentity,
  onShowLinks,
}: {
  ensureIdentity: () => Promise<Identity | null>;
  onShowLinks: (creatorId: string) => void;
}) {
  const library = useLibrary();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const importFile = async (file: File) => {
    setError(null);
    setImported(null);
    try {
      const cells = /\.xlsx$/i.test(file.name)
        ? ((await (await import('read-excel-file/browser')).default(file)).find((s) => s.data.length > 1)?.data ?? [])
        : parseDelimited(await file.text());
      const list = creatorsFromTable(cells);
      if (!list.length) throw new Error('No creators found. Use columns like hark_creator_id, name, instagram, tiktok, youtube.');
      const who = await ensureIdentity();
      if (!who) return;
      const res = await library.saveCreators(list, who.name);
      const kept = res.creators.filter((c, i) => list[i].id && c.id !== list[i].id!.toUpperCase());
      setImported(
        `Imported ${res.created.length} new creator${res.created.length === 1 ? '' : 's'}; ${list.length - res.created.length} were already registered.` +
          (kept.length ? ` ${kept.map((c) => `${c.name} already had ${c.id}`).join('; ')}, so their existing ID was kept.` : ''),
      );
    } catch (err) {
      setError(`Couldn’t import ${file.name}: ${(err as Error).message}`);
    }
  };

  const linkCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of library.links) {
      const id = l.params.hark_creator_id;
      if (id && l.status === 'active') counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [library.links]);

  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return library.creators.filter((c) => {
      const hay = [c.id, c.name, ...Object.values(c.handles)].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [library.creators, q]);

  if (library.storage === 'loading') return <Card>Loading creators…</Card>;
  if (library.storage === 'none') return <SetupNotice />;

  return (
    <div className="stack">
      <Card
        title={`${library.creators.length} creator${library.creators.length === 1 ? '' : 's'}`}
        subtitle="Each creator account (a person, duo or brand) has one Hark creator ID that goes on every link they post, on every platform. IDs are added automatically the first time a creator gets a link."
        actions={
          <>
            <CopyButton
              text={library.creators.map((c) => `${c.id}\t${c.name}\t${Object.entries(c.handles).map(([p, h]) => `${p}: @${h}`).join(', ')}`).join('\n')}
              label="Copy for Sheets"
            />
            <button type="button" className="btn" disabled={!library.creators.length} onClick={() => download('hark-creator-ids.csv', toCreatorsCsv(library.creators))}>
              Download CSV
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()} title="CSV or Excel with hark_creator_id, name, instagram, tiktok, youtube">
              Import CSV
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setAdding((a) => !a)}>
              {adding ? 'Close' : 'Add a creator'}
            </button>
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
            if (f) void importFile(f);
            e.target.value = '';
          }}
        />
        {imported && <Notice tone="good">{imported}</Notice>}
        {adding && (
          <CreatorForm
            submitLabel="Add creator"
            onCancel={() => setAdding(false)}
            onSubmit={async (draft) => {
              const who = await ensureIdentity();
              if (!who) return;
              const res = await library.saveCreators([{ name: draft.name, handles: draft.handles, id: draft.id || undefined }], who.name);
              if (!res.created.length) throw new Error(`Already registered as ${res.creators[0].name} (${res.creators[0].id}).`);
              setAdding(false);
            }}
          />
        )}
        <input
          type="search"
          className="search wide-search"
          placeholder="Search by name, handle or CT ID"
          aria-label="Search creators"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {error && <Notice tone="bad">{error}</Notice>}
        {library.creators.length === 0 ? (
          <p className="empty-state">No creators yet. They’re added the first time you save links for them in Bulk / creator list.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Creator ID</th>
                  <th>Name</th>
                  <th>Handles</th>
                  <th>Links</th>
                  <th>Added</th>
                  <th>
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) =>
                  editing === c.id ? (
                    <tr key={c.id}>
                      <td colSpan={6}>
                        <CreatorForm
                          initial={c}
                          submitLabel="Save changes"
                          onCancel={() => setEditing(null)}
                          onSubmit={async (draft) => {
                            setError(null);
                            await library.updateCreator(c.id, { name: draft.name, handles: draft.handles, id: draft.id || c.id });
                            setEditing(null);
                          }}
                          idWarning={linkCounts.get(c.id) ? `${linkCounts.get(c.id)} saved links already carry ${c.id}. Changing the ID only affects links built from now on.` : undefined}
                        />
                      </td>
                    </tr>
                  ) : (
                    <tr key={c.id}>
                      <td>
                        <code>{c.id}</code>
                      </td>
                      <td>
                        <strong>{c.name}</strong>
                      </td>
                      <td>
                        {Object.entries(c.handles).map(([p, h]) => (
                          <div key={p} className="small">
                            <span className="muted">{PLATFORM_NAMES[p] ?? p}</span> @{h}
                          </div>
                        ))}
                      </td>
                      <td>
                        {linkCounts.get(c.id) ? (
                          <button type="button" className="btn-link" onClick={() => onShowLinks(c.id)}>
                            {linkCounts.get(c.id)}
                          </button>
                        ) : (
                          <span className="muted">0</span>
                        )}
                      </td>
                      <td className="muted small">
                        {c.createdBy || '—'} · {formatDate(c.createdAt)}
                      </td>
                      <td className="col-actions">
                        <button type="button" className="btn btn-small" onClick={() => setEditing(c.id)}>
                          Edit
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

interface CreatorDraft {
  id: string;
  name: string;
  handles: Record<string, string>;
}

function CreatorForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  idWarning,
}: {
  initial?: CreatorRecord;
  submitLabel: string;
  onSubmit: (draft: CreatorDraft) => Promise<void>;
  onCancel: () => void;
  idWarning?: string;
}) {
  const [draft, setDraft] = useState<CreatorDraft>({ id: initial?.id ?? '', name: initial?.name ?? '', handles: { ...(initial?.handles ?? {}) } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const platforms = [...new Set([...PLATFORMS, ...Object.keys(draft.handles)])];
  return (
    <form
      className="creator-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const handles = Object.fromEntries(Object.entries(draft.handles).filter(([, h]) => h.trim()));
          await onSubmit({ ...draft, handles });
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="fields three">
        <Field label="Name" required value={draft.name} onChange={(name) => setDraft({ ...draft, name })} placeholder="Olivia Zhang, or Mia & Lexie" />
        {platforms.map((p) => (
          <Field
            key={p}
            label={`${PLATFORM_NAMES[p] ?? p} handle`}
            value={draft.handles[p] ?? ''}
            onChange={(h) => setDraft({ ...draft, handles: { ...draft.handles, [p]: h } })}
            placeholder="@handle"
          />
        ))}
        <Field
          label="Hark creator ID"
          value={draft.id}
          onChange={(id) => setDraft({ ...draft, id })}
          placeholder={initial ? initial.id : 'Leave blank for the next CT number'}
          help={idWarning ?? 'Only fill this in if Hark already issued this creator an ID.'}
          mono
        />
      </div>
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="row-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !draft.name.trim()}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
