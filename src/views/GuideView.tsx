import { CHANNEL_GROUPS, CHANNELS, NO_LINK_CHANNELS } from '../config/channels';
import { PARAM_KEYS, PARAMS } from '../config/params';
import { Card } from '../components/ui';
import { hasMacro } from '../lib/utm';

const RULES: [string, string][] = [
  ['Pick the channel first.', 'It sets the source / medium pair from the schema’s Source & Medium sheet, so a channel always reports in one place.'],
  ['Lowercase a–z, 0–9 and underscores only.', 'Spaces, hyphens, dots and @ become underscores, and repeats collapse. The builder does this for you: “US-Signup Food.202610” → us_signup_food_202610.'],
  ['Campaigns are {market}_{objective}_{theme}_{yyyymm}.', 'e.g. us_signup_food_202610. Objectives: awareness, signup, app_install, activation, reengage. Never rename a campaign after launch.'],
  ['Creator links are platform / creator, with a Hark creator ID.', 'Source is the platform (instagram, tiktok, youtube), medium is creator, Content is the handle and hark_creator_id is CT + 4 digits: one per creator account, the same on every platform. The Creators tab assigns and remembers them.'],
  ['Creator posts boosted through a Hark ad account are paid social.', 'Use the Meta or TikTok Ads channel (meta / paid_social) and keep the creator ID.'],
  ['Source is who sent the traffic.', 'The buying platform for paid (meta, google, tiktok), the social platform for creators (instagram, tiktok, youtube), never a link tool like Linktree.'],
  ['Paid links carry the platform’s IDs, not names.', 'The hark_ad_* fields hold the platform macros; utm_campaign stays readable. IDs are kept exactly, including case and leading zeros.'],
  ['Never put REPLACE_ placeholders live.', 'Where a platform has no verified macro, paste the real ID or leave the field out and note the reporting gap.'],
  ['Test a real click before launch.', 'Especially link-in-bio tools, which can strip or rewrite parameters, and ad macros, which should arrive as values, not {{…}}.'],
  ['No tracking parameters on links between Hark’s own pages.', 'They start a new visit and overwrite where the person really came from.'],
];

export function GuideView() {
  return (
    <div className="stack">
      <Card title="House rules" subtitle="From the Hark x Darkroom UTM schema v1.6 (Engineering handoff, 1 October 2026), the version shared with Hark.">
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
                <th>When</th>
                <th>What goes in it</th>
                <th>Example</th>
              </tr>
            </thead>
            <tbody>
              {PARAM_KEYS.map((k) => (
                <tr key={k}>
                  <td>
                    <code>{k}</code>
                    <div className="muted small">{PARAMS[k].label}</div>
                  </td>
                  <td className="small">{PARAMS[k].when}</td>
                  <td>{PARAMS[k].help}</td>
                  <td>
                    <code className={hasMacro(PARAMS[k].example) ? 'macro' : ''}>{PARAMS[k].example}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">
          Click IDs (gclid, fbclid, ttclid…) are added by the platforms, never by hand. GA4 doesn’t read hark_* parameters on its own:
          Hark captures them and registers the ones it reports on as custom dimensions.
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
                <th>Source / medium</th>
                <th>Pre-filled</th>
              </tr>
            </thead>
            {CHANNEL_GROUPS.map((g) => (
              <tbody key={g}>
                <tr className="group-row">
                  <th colSpan={3}>{g}</th>
                </tr>
                {CHANNELS.filter((c) => c.group === g).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.label}</strong>
                      {c.unlisted && c.id !== 'other' && <div className="warn-text small">Not in the schema yet</div>}
                      <div className="muted small">{c.description}</div>
                    </td>
                    <td>
                      <code>
                        {c.defaults.utm_source ?? c.sources?.join(' | ') ?? c.options?.utm_source?.slice(0, 3).join(' | ') ?? 'you choose'}
                      </code>{' '}
                      / <code>{(c.mediums ?? [c.defaults.utm_medium ?? 'any']).join(' | ')}</code>
                      {c.required?.length ? (
                        <div className="muted small">Requires {c.required.map((k) => PARAMS[k].label.toLowerCase()).join(', ')}</div>
                      ) : null}
                    </td>
                    <td className="prefilled">
                      {PARAM_KEYS.filter((k) => k !== 'utm_source' && k !== 'utm_medium' && c.defaults[k]).map((k) => (
                        <div key={k}>
                          <span className="muted">{k}</span> <code className={hasMacro(c.defaults[k]!) ? 'macro' : ''}>{c.defaults[k]}</code>
                        </div>
                      ))}
                      {c.paramsField && <div className="muted small">Paste into {c.paramsField}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
            <tbody>
              <tr className="group-row">
                <th colSpan={3}>No link to build</th>
              </tr>
              {NO_LINK_CHANNELS.map((c) => (
                <tr key={c.label}>
                  <td>
                    <strong>{c.label}</strong>
                  </td>
                  <td>
                    <code>{c.pair}</code>
                  </td>
                  <td className="muted small">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
