import { useMemo, useState } from 'react';
import { CHANNELS, channelOf } from '../config/channels';
import { PARAMS, type ParamKey } from '../config/params';
import { Badge, Card, CopyButton, formatDate, formatDateTime, Notice, UrlText } from '../components/ui';
import { download, toCsv, toSlack } from '../lib/export';
import type { LinkRecord } from '../lib/types';
import { isCurrentFormat } from '../lib/utm';
import { useLibrary } from '../state/library';

export interface LibraryFilters {
  q: string;
  channel: string;
  team: string;
  batch: string;
  status: 'active' | 'archived';
  /** Only links built before the Hark schema. */
  oldOnly: boolean;
}

export const emptyFilters = (): LibraryFilters => ({ q: '', channel: '', team: '', batch: '', status: 'active', oldOnly: false });

const PAGE = 100;

function matches(link: LinkRecord, words: string[]): boolean {
  if (!words.length) return true;
  const hay = [link.label, link.url, link.batchName, link.createdBy, link.team, link.notes, ...Object.values(link.params)]
    .join(' ')
    .toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function LibraryView({
  filters,
  setFilters,
  onReuse,
}: {
  filters: LibraryFilters;
  setFilters: (f: LibraryFilters) => void;
  onReuse: (link: LinkRecord) => void;
}) {
  const library = useLibrary();
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<LibraryFilters>) => {
    setShown(PAGE);
    setFilters({ ...filters, ...patch });
  };

  const oldFormat = useMemo(() => new Set(library.links.filter((l) => !isCurrentFormat(l)).map((l) => l.id)), [library.links]);
  const oldActive = library.links.filter((l) => l.status === 'active' && oldFormat.has(l.id)).length;

  const filtered = useMemo(() => {
    const words = filters.q.toLowerCase().split(/\s+/).filter(Boolean);
    return library.links.filter(
      (l) =>
        l.status === filters.status &&
        (!filters.oldOnly || oldFormat.has(l.id)) &&
        (!filters.channel || l.channel === filters.channel) &&
        (!filters.team || l.team === filters.team) &&
        (!filters.batch || l.batchName === filters.batch) &&
        matches(l, words),
    );
  }, [library.links, filters, oldFormat]);

  const batches = useMemo(() => {
    const map = new Map<string, { name: string; count: number; by: string; at: string }>();
    for (const l of library.links) {
      if (!l.batchName || l.status !== 'active') continue;
      const b = map.get(l.batchName) ?? { name: l.batchName, count: 0, by: l.createdBy, at: l.createdAt };
      b.count++;
      if (l.createdAt > b.at) b.at = l.createdAt;
      map.set(l.batchName, b);
    }
    return [...map.values()].sort((a, b) => b.at.localeCompare(a.at));
  }, [library.links]);

  const teams = useMemo(() => [...new Set(library.links.map((l) => l.team).filter(Boolean))].sort(), [library.links]);
  const usedChannels = useMemo(() => new Set(library.links.map((l) => l.channel)), [library.links]);
  const archivedCount = library.links.filter((l) => l.status === 'archived').length;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (library.storage === 'loading') return <Card>Loading the library…</Card>;
  if (library.storage === 'error') {
    return (
      <Notice tone="bad">
        Couldn’t load the library: {library.error}{' '}
        <button type="button" className="btn-link" onClick={() => void library.refresh()}>
          Try again
        </button>
      </Notice>
    );
  }
  if (library.storage === 'none') return <SetupNotice />;

  const filtering = filters.q || filters.channel || filters.team || filters.batch || filters.oldOnly;
  const fileName = (filters.batch || 'utm-links').replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  return (
    <div className="stack">
      {oldActive > 0 && !filters.oldOnly && (
        <Notice tone="warn">
          {oldActive} active link{oldActive === 1 ? ' doesn’t' : 's don’t'} match the Hark schema (v1.6), mostly ones built before it.{' '}
          <button type="button" className="btn-link" onClick={() => set({ ...emptyFilters(), oldOnly: true })}>
            Review them
          </button>
        </Notice>
      )}
      {batches.length > 0 && (
        <div className="batches" aria-label="Recent batches">
          {batches.slice(0, 8).map((b) => (
            <button
              key={b.name}
              type="button"
              className={`batch ${filters.batch === b.name ? 'active' : ''}`}
              onClick={() => set({ batch: filters.batch === b.name ? '' : b.name, status: 'active' })}
            >
              <strong>{b.name}</strong>
              <span className="muted small">
                {b.count} links · {b.by || 'unknown'} · {formatDate(b.at)}
              </span>
            </button>
          ))}
        </div>
      )}

      <Card
        title={`${filtered.length} ${filters.status === 'archived' ? 'archived ' : ''}link${filtered.length === 1 ? '' : 's'}`}
        subtitle={filtering ? `Filtered from ${library.links.length}` : 'Everything the team has built, newest first. Search covers names, handles, campaigns and URLs.'}
        actions={
          <>
            <CopyButton text={toSlack(filtered)} label="Copy for Slack" />
            <button type="button" className="btn" disabled={!filtered.length} onClick={() => download(`${fileName}.csv`, toCsv(filtered))}>
              Download CSV
            </button>
          </>
        }
      >
        <div className="filters">
          <input
            type="search"
            className="search"
            placeholder="Search: olivia, tiktok, creator_always_on…"
            aria-label="Search links"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
          />
          <select aria-label="Channel" value={filters.channel} onChange={(e) => set({ channel: e.target.value })}>
            <option value="">All channels</option>
            {CHANNELS.filter((c) => usedChannels.has(c.id)).map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select aria-label="Team" value={filters.team} onChange={(e) => set({ team: e.target.value })}>
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select aria-label="Batch" value={filters.batch} onChange={(e) => set({ batch: e.target.value })}>
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b.name}>{b.name}</option>
            ))}
          </select>
          <div className="segmented" role="group" aria-label="Status">
            <button type="button" aria-pressed={filters.status === 'active'} onClick={() => set({ status: 'active' })}>
              Active
            </button>
            <button type="button" aria-pressed={filters.status === 'archived'} onClick={() => set({ status: 'archived' })}>
              Archived{archivedCount ? ` (${archivedCount})` : ''}
            </button>
          </div>
          {filtering && (
            <button type="button" className="btn-link" onClick={() => set({ q: '', channel: '', team: '', batch: '', oldOnly: false })}>
              Clear filters
            </button>
          )}
        </div>

        {error && <Notice tone="bad">{error}</Notice>}

        {filtered.length === 0 ? (
          <p className="empty-state">
            {library.links.length === 0
              ? 'No links yet. Build one, or paste a list into Bulk, and save it here.'
              : 'Nothing matches those filters.'}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table library-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="col-url">Link</th>
                  <th>Created</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, shown).map((l) => (
                  <tr key={l.id} className={oldFormat.has(l.id) ? 'legacy-row' : undefined}>
                    <td className="col-name">
                      <strong>{l.label || '(untitled)'}</strong>
                      <div className="param-chips">
                        {oldFormat.has(l.id) && (
                          <Badge tone="warn" title="Doesn’t match the Hark schema v1.6. Rebuild it with Reuse, then archive this one.">
                            Off schema
                          </Badge>
                        )}
                        <Badge tone="neutral">{channelOf(l.channel).label}</Badge>
                        {Object.entries(l.params)
                          .filter(([k, v]) => v && k !== 'utm_medium' && !/^\{|^__/.test(v))
                          .map(([k, v]) => (
                            <span key={k} className="kv" title={k}>
                              <span className="muted">{(PARAMS[k as ParamKey]?.label ?? k).toLowerCase()}</span> {v}
                            </span>
                          ))}
                      </div>
                      {l.notes && <div className="muted small">{l.notes}</div>}
                    </td>
                    <td className="col-url">
                      <div className="url-cell">
                        <UrlText url={l.url} />
                        <CopyButton text={l.url} label="Copy" className="btn btn-small" />
                      </div>
                    </td>
                    <td className="col-created" title={formatDateTime(l.createdAt)}>
                      <div>{l.createdBy || '—'}</div>
                      <div className="muted small">
                        {l.team ? `${l.team} · ` : ''}
                        {formatDate(l.createdAt)}
                      </div>
                      {l.batchName && (
                        <button type="button" className="btn-link small" onClick={() => set({ batch: l.batchName! })}>
                          {l.batchName}
                        </button>
                      )}
                    </td>
                    <td className="col-actions">
                      <button type="button" className="btn btn-small" onClick={() => onReuse(l)} title="Open in Build with these values">
                        Reuse
                      </button>
                      {l.status === 'active' ? (
                        <button type="button" className="btn btn-small" disabled={busy} onClick={() => act(() => library.update([l.id], { status: 'archived' }))}>
                          Archive
                        </button>
                      ) : (
                        <>
                          <button type="button" className="btn btn-small" disabled={busy} onClick={() => act(() => library.update([l.id], { status: 'active' }))}>
                            Restore
                          </button>
                          <button
                            type="button"
                            className="btn btn-small btn-danger"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(`Delete “${l.label || l.url}” for good? Anyone using this link keeps it, but it leaves the library.`)) {
                                void act(() => library.remove([l.id]));
                              }
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > shown && (
          <button type="button" className="btn" onClick={() => setShown((n) => n + PAGE * 2)}>
            Show more ({filtered.length - shown} left)
          </button>
        )}
        {filters.oldOnly && filters.status === 'active' && filtered.length > 0 && (
          <div className="row-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                if (confirm(`Archive all ${filtered.length} off-schema links? Links already posted keep working; they just leave the active library.`)) {
                  void act(() => library.update(filtered.map((l) => l.id), { status: 'archived' }));
                }
              }}
            >
              Archive all {filtered.length} off-schema links
            </button>
          </div>
        )}
        {filters.batch && filters.status === 'active' && filtered.length > 0 && (
          <div className="row-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                if (confirm(`Archive all ${filtered.length} links in “${filters.batch}”? You can restore them from Archived.`)) {
                  void act(() => library.update(filtered.map((l) => l.id), { status: 'archived' }));
                }
              }}
            >
              Archive this batch
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}

export function SetupNotice() {
  return (
    <Card title="Connect a database to turn on the shared library">
      <p>
        Links can be built, copied and downloaded right now. Saving them for the whole team needs a Postgres database, which
        takes about two minutes to connect in Vercel:
      </p>
      <ol className="steps">
        <li>
          In Vercel, open this project → <strong>Storage</strong> → <strong>Create Database</strong> → <strong>Neon</strong>{' '}
          (Serverless Postgres, free tier is fine).
        </li>
        <li>
          Connect it to this project for all environments. Vercel adds <code>DATABASE_URL</code> for you.
        </li>
        <li>
          Redeploy (<strong>Deployments</strong> → ⋯ → <strong>Redeploy</strong>). The table is created on first use.
        </li>
      </ol>
    </Card>
  );
}
