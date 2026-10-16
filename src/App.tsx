import { useCallback, useEffect, useRef, useState } from 'react';
import { APP } from './config/app';
import type { LinkRecord } from './lib/types';
import { useIdentity, type Identity } from './state/identity';
import { useLibrary } from './state/library';
import { BuildView, newDraft, type BuildDraft } from './views/BuildView';
import { BulkView, newBulkState, type BulkState } from './views/BulkView';
import { GuideView } from './views/GuideView';
import { emptyFilters, LibraryView, type LibraryFilters } from './views/LibraryView';

const TABS = [
  { id: 'build', label: 'Build a link' },
  { id: 'bulk', label: 'Bulk from a list' },
  { id: 'library', label: 'Library' },
  { id: 'guide', label: 'Conventions' },
] as const;
type Tab = (typeof TABS)[number]['id'];

const readTab = (): Tab => {
  const t = new URLSearchParams(location.search).get('tab');
  return TABS.some((x) => x.id === t) ? (t as Tab) : 'build';
};

export function App() {
  const library = useLibrary();
  const { identity, setIdentity } = useIdentity();
  const [tab, setTabState] = useState<Tab>(readTab);
  const [draft, setDraft] = useState<BuildDraft>(() => newDraft());
  const [bulk, setBulk] = useState<BulkState>(newBulkState);
  const [filters, setFilters] = useState<LibraryFilters>(emptyFilters);
  const [askingIdentity, setAskingIdentity] = useState(false);
  const identityResolver = useRef<((v: Identity | null) => void) | null>(null);

  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    const url = new URL(location.href);
    if (next === 'build') url.searchParams.delete('tab');
    else url.searchParams.set('tab', next);
    history.replaceState(null, '', url);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onPop = () => setTabState(readTab());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /** Saving stamps who made the link; ask once, then remember in this browser. */
  const ensureIdentity = useCallback((): Promise<Identity | null> => {
    if (identity) return Promise.resolve(identity);
    setAskingIdentity(true);
    return new Promise((resolve) => {
      identityResolver.current = resolve;
    });
  }, [identity]);

  const closeIdentity = (value: Identity | null) => {
    if (value) setIdentity(value);
    setAskingIdentity(false);
    identityResolver.current?.(value);
    identityResolver.current = null;
  };

  const reuse = (link: LinkRecord) => {
    setDraft({ channel: link.channel, destination: link.baseUrl, params: { ...link.params }, label: '', notes: '' });
    setTab('build');
  };

  const storageLabel = {
    loading: { tone: 'muted', text: 'Connecting…' },
    database: { tone: 'good', text: 'Shared library' },
    none: { tone: 'warn', text: 'Not saving yet' },
    error: { tone: 'bad', text: 'Library offline' },
  }[library.storage];

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-row">
            <div className="brand">
              <span className="logo" aria-hidden>
                H
              </span>
              <div>
                <h1>
                  {APP.client} · {APP.title}
                </h1>
                <p className="muted small">One naming convention for every channel. Every link saved for the team.</p>
              </div>
            </div>
            <div className="top-right">
              <button
                type="button"
                className={`pill pill-${storageLabel.tone}`}
                onClick={() => setTab('library')}
                title={library.storage === 'none' ? 'Connect a database to save links for the team' : 'Open the library'}
              >
                <span className="dot" aria-hidden /> {storageLabel.text}
                {library.storage === 'database' && ` · ${library.links.filter((l) => l.status === 'active').length}`}
              </button>
              <button type="button" className="pill" onClick={() => setAskingIdentity(true)} title="Change who's building links">
                {identity ? `${identity.name}${identity.team ? ` · ${identity.team}` : ''}` : 'Set your name'}
              </button>
            </div>
          </div>
          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <button key={t.id} type="button" className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="shell">
        <div hidden={tab !== 'build'}>
          <BuildView draft={draft} setDraft={setDraft} ensureIdentity={ensureIdentity} onOpenLibrary={() => setTab('library')} />
        </div>
        <div hidden={tab !== 'bulk'}>
          <BulkView
            state={bulk}
            setState={setBulk}
            ensureIdentity={ensureIdentity}
            onOpenLibrary={(batch) => {
              setFilters({ ...emptyFilters(), batch: batch ?? '' });
              setTab('library');
            }}
          />
        </div>
        {tab === 'library' && <LibraryView filters={filters} setFilters={setFilters} onReuse={reuse} />}
        {tab === 'guide' && <GuideView />}
      </main>

      <footer className="footer muted small">
        {APP.client} UTM Builder · built by {APP.preparedBy} · conventions live in <code>src/config</code>
      </footer>

      {askingIdentity && <IdentityDialog initial={identity} onClose={closeIdentity} />}
    </>
  );
}

function IdentityDialog({ initial, onClose }: { initial: Identity | null; onClose: (v: Identity | null) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initial?.name ?? '');
  const [team, setTeam] = useState(initial?.team ?? '');
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="dialog" onCancel={() => onClose(null)} aria-labelledby="identity-title">
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onClose({ name: name.trim(), team });
        }}
      >
        <h2 id="identity-title">Who’s building links?</h2>
        <p className="muted">Saved links show who made them, so teammates know who to ask. Remembered in this browser.</p>
        <div className="field">
          <label htmlFor="id-name">Your name</label>
          <input id="id-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Zach" />
        </div>
        <div className="field">
          <label htmlFor="id-team">Team</label>
          <select id="id-team" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">Choose a team</option>
            {APP.teams.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="row-actions">
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            Save
          </button>
          <button type="button" className="btn" onClick={() => onClose(null)}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
