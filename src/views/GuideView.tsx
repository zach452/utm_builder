import { CHANNEL_GROUPS, CHANNELS } from '../config/channels';
import { PARAM_KEYS, PARAMS } from '../config/params';
import { Card } from '../components/ui';
import { hasMacro } from '../lib/utm';

const RULES: [string, string][] = [
  ['Everything is lowercase, with underscores for spaces.', 'Analytics tools treat “TikTok” and “tiktok” as two sources. The builder converts values for you.'],
  ['Pick the channel first.', 'It sets the medium, so a channel always reports in one place.'],
  ['One source name per platform.', 'instagram, not ig or insta. Aliases like IG, TT and FB are converted automatically.'],
  ['Use the platform macros on ads.', 'One parameter string covers every ad, and the names fill themselves in.'],
  ['Creators: Content is the handle on that platform, without the @. Term is where the link sits.', 'Handles are unique and match what the creator team already tracks. The library keeps the creator’s name alongside.'],
  ['Never put UTMs on links between Hark’s own pages.', 'A UTM on an internal link starts a new session and overwrites where the visitor really came from.'],
  ['App store links drop UTMs.', 'Send people to a web page, or use the store’s own campaign links or the attribution (MMP) link.'],
  ['Reuse before you rebuild.', 'If a link already exists, the builder shows it, so search the library first.'],
];

export function GuideView() {
  return (
    <div className="stack">
      <Card title="House rules">
        <ol className="rules">
          {RULES.map(([rule, why]) => (
            <li key={rule}>
              <strong>{rule}</strong> <span className="muted">{why}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Parameters" subtitle="Source, medium and campaign are on every link. The rest depend on the channel.">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>What goes in it</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              {PARAM_KEYS.map((k) => (
                <tr key={k}>
                  <td>
                    <code>{k}</code>
                    <div className="muted small">
                      {PARAMS[k].label}
                      {PARAMS[k].required ? ' · required' : ''}
                    </div>
                  </td>
                  <td>{PARAMS[k].help}</td>
                  <td>
                    <code>{PARAMS[k].example}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          utm_adgroup, utm_ad, utm_creative and utm_usecase are custom parameters. GA4 and most attribution tools read them once
          they’re added as custom dimensions or properties.
        </p>
      </Card>

      <Card
        title="Channels"
        subtitle="What each channel fills in. To add or change one, edit src/config/channels.ts and push; Vercel redeploys in about a minute."
      >
        <div className="table-wrap">
          <table className="table channels-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Medium</th>
                <th>Source</th>
                <th>Pre-filled</th>
              </tr>
            </thead>
            {CHANNEL_GROUPS.map((g) => (
              <tbody key={g}>
                <tr className="group-row">
                  <th colSpan={4}>{g}</th>
                </tr>
                {CHANNELS.filter((c) => c.group === g).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.label}</strong>
                      <div className="muted small">{c.description}</div>
                    </td>
                    <td>
                      <code>{c.defaults.utm_medium ?? 'any'}</code>
                    </td>
                    <td>
                      <code>{c.defaults.utm_source ?? c.options?.utm_source?.slice(0, 3).join(', ') ?? 'you choose'}</code>
                    </td>
                    <td className="prefilled">
                      {PARAM_KEYS.filter((k) => k !== 'utm_source' && k !== 'utm_medium' && c.defaults[k]).map((k) => (
                        <div key={k}>
                          <span className="muted">{PARAMS[k].label}:</span>{' '}
                          <code className={hasMacro(c.defaults[k]!) ? 'macro' : ''}>{c.defaults[k]}</code>
                        </div>
                      ))}
                      {c.paramsField && <div className="muted small">Paste into {c.paramsField}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Card>
    </div>
  );
}
