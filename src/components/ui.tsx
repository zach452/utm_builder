import { useId, useState, type ReactNode } from 'react';
import { currentYyyymm } from '../config/app';
import { CHANNEL_GROUPS, CHANNELS } from '../config/channels';
import { CAMPAIGN } from '../config/params';
import { slugify } from '../lib/utm';
import type { Issue } from '../lib/utm';

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

export function CopyButton({
  text,
  label = 'Copy',
  className = 'btn',
  disabled,
  title,
}: {
  text: string;
  label?: string;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={disabled || !text}
      title={title}
      onClick={async () => {
        await copyText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? 'Copied ✓' : label}
    </button>
  );
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({
  label,
  value,
  onChange,
  suggestions,
  help,
  hint,
  required,
  placeholder,
  error,
  mono,
  onFocus,
  inputId,
  wide,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  suggestions?: string[];
  help?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  placeholder?: string;
  error?: boolean;
  mono?: boolean;
  onFocus?: () => void;
  inputId?: string;
  wide?: boolean;
}) {
  const autoId = useId();
  const id = inputId ?? autoId;
  const listId = `${id}-list`;
  return (
    <div className={`field${error ? ' has-error' : ''}${wide ? ' wide' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="req" aria-label="required">*</span>}
      </label>
      <input
        id={id}
        className={mono ? 'mono' : undefined}
        value={value}
        placeholder={placeholder}
        list={suggestions?.length ? listId : undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        autoComplete="off"
        spellCheck={false}
      />
      {suggestions && suggestions.length > 0 && (
        <datalist id={listId}>
          {[...new Set(suggestions)].slice(0, 200).map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {hint && <div className="field-hint">{hint}</div>}
      {help && <div className="field-help">{help}</div>}
    </div>
  );
}

export function ChannelSelect({ value, onChange, id }: { value: string; onChange: (id: string) => void; id?: string }) {
  return (
    <select id={id} className="channel-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {CHANNEL_GROUPS.map((g) => (
        <optgroup key={g} label={g}>
          {CHANNELS.filter((c) => c.group === g).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="issues">
      {issues.map((i, n) => (
        <li key={n} className={i.severity}>
          {i.message}
        </li>
      ))}
    </ul>
  );
}

export function Badge({ tone = 'neutral', children, title }: { tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info'; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'good' | 'bad'; children: ReactNode }) {
  return <div className={`notice notice-${tone}`}>{children}</div>;
}

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export const formatDateTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Renders a URL with the query string dimmed and macros highlighted, so it scans at a glance. */
export function UrlText({ url }: { url: string }) {
  const q = url.indexOf('?');
  if (q === -1) return <span className="url">{url}</span>;
  const parts = url.slice(q + 1).split(/(\{\{[^{}]+\}\}|\{[^{}]+\}|__[A-Z][A-Z0-9_]*?__)/g);
  return (
    <span className="url">
      <span className="url-base">{url.slice(0, q)}</span>
      <span className="url-q">
        ?
        {parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}
      </span>
    </span>
  );
}

/** Builds a campaign name in the schema's {market}_{objective}_{theme}_{yyyymm} format. */
export function CampaignHelper({ onUse }: { onUse: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [market, setMarket] = useState('us');
  const [objective, setObjective] = useState('signup');
  const [theme, setTheme] = useState('');
  const [month, setMonth] = useState(currentYyyymm());
  const name = [market, objective, slugify(theme), month.replace(/\D/g, '')].filter(Boolean).join('_');
  if (!open) {
    return (
      <button type="button" className="btn-link small" onClick={() => setOpen(true)}>
        Build the name: market_objective_theme_yyyymm
      </button>
    );
  }
  return (
    <div className="campaign-helper">
      <select aria-label="Market" value={market} onChange={(e) => setMarket(e.target.value)}>
        {CAMPAIGN.markets.map((m) => (
          <option key={m}>{m}</option>
        ))}
      </select>
      <select aria-label="Objective" value={objective} onChange={(e) => setObjective(e.target.value)}>
        {CAMPAIGN.objectives.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <input aria-label="Theme" placeholder="theme, e.g. creators" value={theme} onChange={(e) => setTheme(e.target.value)} />
      <input aria-label="Month (yyyymm)" className="mono" size={7} value={month} onChange={(e) => setMonth(e.target.value)} />
      <button
        type="button"
        className="btn btn-small"
        disabled={!theme.trim()}
        onClick={() => {
          onUse(name);
          setOpen(false);
        }}
      >
        Use {theme.trim() ? name : ''}
      </button>
    </div>
  );
}
