import { useMemo, useState, type ReactNode } from 'react';
import { APP } from '../config/app';
import { channelOf } from '../config/channels';
import { PARAM_KEYS, PARAMS, type ParamKey, type Params } from '../config/params';
import { Badge, CampaignHelper, Card, ChannelSelect, CopyButton, Field, formatDate, IssueList, Notice, UrlText } from '../components/ui';
import { creatorForContent } from '../lib/creators';
import { suggestionsFor } from '../lib/memory';
import type { CreatorRecord, NewLink } from '../lib/types';
import { buildLink, hasMacro, normalizeParam } from '../lib/utm';
import { useLibrary } from '../state/library';
import type { Identity } from '../state/identity';

export interface BuildDraft {
  channel: string;
  destination: string;
  params: Params;
  label: string;
  notes: string;
}

export const newDraft = (channel = 'influencer_linkinbio', destination = APP.destinations[0]?.url ?? ''): BuildDraft => ({
  channel,
  destination,
  params: { ...channelOf(channel).defaults },
  label: '',
  notes: '',
});

/**
 * Switching channel fills in the new channel's defaults. Values the user typed survive only in
 * fields the new channel leaves open (a campaign name, a use case), never the old defaults.
 */
function switchChannel(draft: BuildDraft, nextId: string): BuildDraft {
  const before = channelOf(draft.channel).defaults;
  const after = channelOf(nextId).defaults;
  const params: Params = {};
  for (const k of PARAM_KEYS) {
    const v = draft.params[k] ?? '';
    const typed = v.trim() !== '' && v !== before[k] && !hasMacro(v);
    const next = after[k] ?? (typed ? v : '');
    if (next) params[k] = next;
  }
  return { ...draft, channel: nextId, params };
}

/** "Olivia Zhang · instagram" for a registered creator, else the content or campaign plus source. */
export function autoLabel(params: Params, creators: CreatorRecord[] = []): string {
  const creator = params.hark_creator_id ? creators.find((c) => c.id === params.hark_creator_id) : undefined;
  const who = creator?.name || (params.utm_content && !hasMacro(params.utm_content) ? params.utm_content : params.utm_campaign);
  return [who, params.utm_source].filter((v) => v && !hasMacro(v)).join(' · ');
}

export function BuildView({
  draft,
  setDraft,
  ensureIdentity,
  onOpenLibrary,
  onOpenBulk,
}: {
  draft: BuildDraft;
  setDraft: (d: BuildDraft) => void;
  ensureIdentity: () => Promise<Identity | null>;
  onOpenLibrary: () => void;
  onOpenBulk: () => void;
}) {
  const library = useLibrary();
  const channel = channelOf(draft.channel);
  const [showAll, setShowAll] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ tone: 'good' | 'info' | 'bad'; text: string } | null>(null);

  const built = useMemo(() => buildLink(draft.channel, draft.destination, draft.params), [draft.channel, draft.destination, draft.params]);
  const existing = built.url ? library.byUrl.get(built.url) : undefined;
  const label = draft.label.trim() || autoLabel(built.params, library.creators);
  const creatorIds = Object.fromEntries(library.creators.map((c) => [c.id, `${c.name} · ${Object.values(c.handles).map((h) => '@' + h).join(' ')}`]));
  const unknownCreator =
    built.params.hark_creator_id && library.storage === 'database' && !creatorIds[built.params.hark_creator_id] && /^CT\d{4,}$/.test(built.params.hark_creator_id);
  const [registering, setRegistering] = useState(false);

  /** Registers the handle in Content as a new creator and fills in the ID it gets. */
  const registerCreator = async () => {
    const who = await ensureIdentity();
    if (!who) return;
    setRegistering(true);
    try {
      const handle = (draft.params.utm_content ?? '').trim().replace(/^@/, '');
      const platform = built.params.utm_source ?? 'other';
      const res = await library.saveCreators([{ name: handle, handles: { [platform]: handle } }], who.name);
      setDraft({ ...draft, params: { ...draft.params, hark_creator_id: res.creators[0].id } });
    } catch (err) {
      setResult({ tone: 'bad', text: (err as Error).message });
    } finally {
      setRegistering(false);
    }
  };

  const extraKeys = PARAM_KEYS.filter((k) => !channel.fields.includes(k));
  const visibleExtras = extraKeys.filter((k) => showAll || draft.params[k]);
  const required = new Set<ParamKey>([...PARAM_KEYS.filter((k) => PARAMS[k].required), ...(channel.required ?? [])]);

  const setParam = (k: ParamKey, v: string) => {
    setResult(null);
    setDraft({ ...draft, params: { ...draft.params, [k]: v } });
  };

  const save = async () => {
    const who = await ensureIdentity();
    if (!who) return;
    setSaving(true);
    try {
      const link: NewLink = {
        url: built.url,
        baseUrl: built.base,
        params: built.params,
        channel: draft.channel,
        label,
        notes: draft.notes.trim(),
        createdBy: who.name,
        team: who.team,
      };
      const res = await library.save([link]);
      setResult(
        res.created.length
          ? { tone: 'good', text: 'Saved to the library.' }
          : { tone: 'info', text: 'This link was already in the library, so nothing new was saved.' },
      );
    } catch (err) {
      setResult({ tone: 'bad', text: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const renderField = (k: ParamKey) => {
    const def = PARAMS[k];
    const raw = draft.params[k] ?? '';
    const normalized = raw.trim() ? normalizeParam(k, raw) : '';
    const issue = built.issues.find((i) => i.param === k && i.severity === 'error');
    let hint: ReactNode = null;
    if (hasMacro(raw)) hint = <span className="macro-hint">Filled in by the ad platform at click time</span>;
    else if (normalized && normalized !== raw.trim()) hint = <>Saved as <code>{normalized}</code></>;
    if (k === 'utm_campaign') {
      hint = (
        <>
          {hint}
          <CampaignHelper onUse={(name) => setParam('utm_campaign', name)} />
        </>
      );
    }
    if (k === 'hark_creator_id') hint = creatorHint();
    return (
      <Field
        key={k}
        label={def.label}
        required={required.has(k)}
        value={raw}
        onChange={(v) => setParam(k, v)}
        placeholder={def.example}
        help={def.help}
        hint={hint}
        error={!!issue}
        mono={hasMacro(raw)}
        suggestions={suggestionsFor(
          channel.defaults[k] ? [channel.defaults[k]!] : [],
          channel.options?.[k],
          k === 'hark_use_case' ? APP.useCases : undefined,
          k === 'hark_creator_id' ? library.creators.map((c) => c.id) : undefined,
          library.memory.params[k],
        )}
        suggestionLabels={k === 'hark_creator_id' ? creatorIds : undefined}
      />
    );
  };

  function creatorHint(): ReactNode {
    const id = built.params.hark_creator_id;
    if (id && creatorIds[id]) return <>{creatorIds[id]}</>;
    if (unknownCreator) return <span className="warn-text">{id} isn’t in the Creators tab yet.</span>;
    const content = draft.params.utm_content ?? '';
    const match = content.trim() ? creatorForContent(library.creators, content) : undefined;
    if (match && match.id !== id) {
      return (
        <>
          @{content.replace(/^@/, '')} is {match.name}.{' '}
          <button type="button" className="btn-link small" onClick={() => setParam('hark_creator_id', match.id)}>
            Use {match.id}
          </button>
        </>
      );
    }
    if (!id && content.trim() && library.storage === 'database') {
      return (
        <button type="button" className="btn-link small" disabled={registering} onClick={registerCreator}>
          {registering ? 'Registering…' : `New creator? Register @${content.trim().replace(/^@/, '')} and get an ID`}
        </button>
      );
    }
    return null;
  }

  return (
    <div className="build-grid">
      <div className="stack">
        <Card title="Channel" subtitle="Sets the medium and, for ad platforms, fills in the platform's macros.">
          <div className="field">
            <label htmlFor="build-channel" className="sr-only">
              Channel
            </label>
            <ChannelSelect id="build-channel" value={draft.channel} onChange={(id) => setDraft(switchChannel(draft, id))} />
          </div>
          <p className="channel-desc">{channel.description}</p>
          {channel.group === 'Creators' && (
            <Notice tone="info">
              Building links for a list of creators? Paste the whole list into{' '}
              <button type="button" className="btn-link" onClick={onOpenBulk}>
                Bulk / creator list
              </button>{' '}
              and get every link at once.
            </Notice>
          )}
          {channel.notes && (
            <ul className="notes">
              {channel.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Link details">
          <div className="fields">
            <Field
              label="Destination URL"
              required
              wide
              value={draft.destination}
              onChange={(v) => {
                setResult(null);
                setDraft({ ...draft, destination: v });
              }}
              placeholder="https://hark.com/"
              suggestions={suggestionsFor(
                APP.destinations.map((d) => d.url),
                library.memory.destinations,
              )}
              help="The page people land on. Any UTMs already on it are replaced."
              error={!!built.issues.find((i) => !i.param && i.severity === 'error')}
            />
            {channel.fields.map(renderField)}
            {visibleExtras.map(renderField)}
          </div>
          {extraKeys.length > 0 && (
            <button type="button" className="btn-link" onClick={() => setShowAll((s) => !s)}>
              {showAll ? 'Hide extra fields' : `More fields (${extraKeys.length}): ${extraKeys.slice(0, 4).map((k) => PARAMS[k].label).join(', ')}…`}
            </button>
          )}
        </Card>
      </div>

      <div className="output-col">
        <Card title="Your link" className="output-card">
          {built.url ? (
            <div className="url-box" data-testid="built-url">
              <UrlText url={built.url} />
            </div>
          ) : (
            <div className="url-box empty">Add a destination URL to see the link.</div>
          )}
          <div className="row-actions">
            <CopyButton text={built.ok ? built.url : ''} label="Copy link" className="btn btn-primary" />
            {built.url && (
              <a className="btn" href={built.url} target="_blank" rel="noreferrer">
                Open
              </a>
            )}
          </div>

          {channel.paramsField && built.query && (
            <div className="params-only">
              <div className="label-row">
                <strong>URL parameters only</strong>
                <CopyButton text={built.query} label="Copy" className="btn btn-small" />
              </div>
              <code className="mono block">{built.query}</code>
              <p className="muted small">Paste into {channel.paramsField}.</p>
            </div>
          )}

          <IssueList issues={built.issues} />

          {existing && (
            <Notice tone="info">
              Already in the library: <strong>{existing.label || 'untitled'}</strong>, saved by {existing.createdBy || 'someone'}
              {existing.team ? ` (${existing.team})` : ''} on {formatDate(existing.createdAt)}.
              {existing.status === 'archived' && ' It’s archived; saving restores it.'}
            </Notice>
          )}

          <div className="fields compact">
            <Field
              label="Name in library"
              value={draft.label}
              onChange={(v) => setDraft({ ...draft, label: v })}
              placeholder={label || 'e.g. Olivia Zhang · TikTok'}
            />
            <div className="field">
              <label htmlFor="build-notes">Notes</label>
              <textarea
                id="build-notes"
                rows={2}
                value={draft.notes}
                placeholder="Optional: who asked for it, where it's posted"
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
          </div>

          {library.storage === 'none' ? (
            <Notice tone="warn">Saving is off until a database is connected. You can still copy the link.</Notice>
          ) : (
            <div className="row-actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!built.ok || saving || library.storage !== 'database' || (!!existing && existing.status === 'active')}
                onClick={save}
              >
                {saving ? 'Saving…' : existing?.status === 'active' ? 'Saved ✓' : 'Save to library'}
              </button>
              <button type="button" className="btn" onClick={() => setDraft(newDraft(draft.channel, draft.destination))}>
                Clear
              </button>
              {result && (
                <span className={`inline-result ${result.tone}`}>
                  {result.text}{' '}
                  {result.tone !== 'bad' && (
                    <button type="button" className="btn-link" onClick={onOpenLibrary}>
                      View library
                    </button>
                  )}
                </span>
              )}
            </div>
          )}
          <div className="param-chips">
            {PARAM_KEYS.filter((k) => built.params[k]).map((k) => (
              <Badge key={k} title={k}>
                {PARAMS[k].label}: {built.params[k]}
              </Badge>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
