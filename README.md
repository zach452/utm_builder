# Hark · UTM Builder

One place for every team to build tracking links with the same naming convention, and a shared
library of every link anyone has made. It's a Vite + React app with one Vercel Function and a
Postgres table. It deploys to Vercel straight from this repo.

| Tab | What it's for |
| --- | --- |
| **Build a link** | One link at a time. Pick a channel, and the medium plus any ad-platform macros fill themselves in. Every field suggests values the team has already used. |
| **Bulk from a list** | Paste anything: a creator list from Slack, rows from Google Sheets, a CSV or Excel file, or a plain list. Each line or row becomes a link. Review, fix, then save, copy for Slack or Sheets, or download a CSV. |
| **Library** | Every saved link, newest first, grouped into batches. Search by creator, handle, campaign or URL. **Reuse** opens a link in the builder as a starting point. Archive what's retired. |
| **Conventions** | The house rules, every parameter and every channel, generated from the config. |

## How the team uses it

- **Creator team.** Paste the creator list exactly as it's written in Slack, e.g.
  `* Olivia Zhang (IG @oliviazhangofficial, TT @livviazhang) - TikTok and IG - link in bio`.
  You get one link per creator per platform, each using that platform's handle. Struck-through
  lines are left out (this survives a rich-text paste from Slack, Notion or Docs). A missing handle
  is flagged. **Copy for Slack** gives a reply grouped by creator.
- **Paid teams.** Pick the platform, copy **URL parameters only**, and paste them into the
  platform's URL-parameters / Final URL suffix field once per ad account or campaign. The macros
  (`{{ad.name}}`, `__CID_NAME__`, `{keyword}`…) fill in at click time.
- **Everyone.** Building a link that already exists shows the saved one and who made it, so the
  same link is never created twice under different names.

The first time someone saves, the app asks for their name and team and remembers it in that
browser. Every saved link records who made it.

## Conventions

- Values are lowercased, with underscores for spaces, and anything that would need URL-encoding is
  stripped. Platform macros are kept exactly as written.
- Source aliases are canonicalised (IG → `instagram`, TT → `tiktok`, FB → `facebook`, Twitter → `x`).
- Parameters always appear in the same order, so the same inputs always produce the same URL.
  That's how duplicates are caught.
- **Creators:** `utm_source` = platform, `utm_medium=creator`, `utm_campaign=creator_always_on`,
  `utm_content` = the creator's handle on that platform (no @), `utm_term` = where the link sits
  (`link_in_bio`, `description`, `comment`…). The library keeps the creator's name with each link.
- Custom parameters `utm_adgroup`, `utm_ad`, `utm_creative` and `utm_usecase` sit alongside the
  standard five. GA4 and most attribution tools read them once they're registered as custom
  dimensions or properties.

Everything lives in `src/config/`:

| File | Change it to… |
| --- | --- |
| `channels.ts` | add a channel, change a medium, update an ad platform's macros, or change the creator defaults |
| `params.ts` | add a UTM parameter (it shows up in every view) |
| `app.ts` | change the default destination, the teams list or the use-case suggestions |

Push the change and Vercel redeploys in about a minute. The **Conventions** tab updates itself.

### Ad platform macros

These were checked against each platform's help docs in October 2026:

| Platform | Campaign | Ad group | Ad | Content |
| --- | --- | --- | --- | --- |
| Meta | `{{campaign.name}}` | `{{adset.name}}` | `{{ad.name}}` | `{{ad.id}}` |
| TikTok | `__CAMPAIGN_NAME__` | `__AID_NAME__` | `__CID_NAME__` | `__CID__` |
| Snapchat | `{{campaign.name}}` | `{{adSet.name}}` | `{{creative.name}}` | `{{ad.id}}` |
| Pinterest | `{campaign_name}` | `{ad_group_name}` | (none) | `{adid}` |
| LinkedIn | `{{CAMPAIGN_GROUP_NAME}}` | `{{CAMPAIGN_NAME}}` | (none) | `{{CREATIVE_ID}}` |
| Google Ads | `{campaignid}` | `{adgroupid}` | `{creative}` | (none). Term is `{keyword}` |
| Microsoft Ads | `{Campaign}` | `{AdGroup}` | `{AdId}` | (none). Term is `{keyword}` |

Google has no name macros, so its links carry IDs. Reddit only documents macros for catalog ads and
X documents none, so those channels take typed values. Meta's list matches Meta's documented
behaviour and every major tool, but Meta's own page listing the macros couldn't be fetched to check it.

## Deploying on Vercel

1. In Vercel, go to **Add New → Project** and import this repo. `vercel.json` sets everything, so
   no settings need to change.
2. **Turn on the shared library:** in the project, go to **Storage → Create Database → Neon**
   (Serverless Postgres; the free tier is plenty) and connect it to the project for all
   environments. That adds `DATABASE_URL`. Redeploy. The table is created on first use.
   Until then the app still builds, copies and downloads links. It just can't save them, and it
   says so.
3. Optional: set `APP_PASSWORD` to put the whole app, including its API, behind a browser
   password prompt (any username works). `middleware.ts` handles this. Vercel Deployment Protection
   works too.

> Anyone who can open the URL can read and add to the library. Set `APP_PASSWORD` or turn on
> Deployment Protection before sharing the link outside the team.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173. Uses an embedded Postgres in .data/, no setup needed
npm test           # UTM rules, paste parser (incl. the Oct 2026 creator list), API against Postgres
npm run build      # typecheck + production build
```

To develop against the real database, run `vercel env pull` and start with
`DATABASE_URL=… npm run dev`.

## How it fits together

```
src/config/        channels, parameters, teams: the conventions, in one place
src/lib/utm.ts     normalise values (macros untouched), build + validate a link
src/lib/dump.ts    paste parser: creator lists, Sheets/CSV/Excel tables, plain lists
src/lib/template.ts  [column] templates for bulk rows
src/views/         Build · Bulk · Library · Conventions
api/links.ts       GET / POST / PATCH / DELETE /api/links → Postgres (utm_links table)
examples/          the Oct 2026 creator request, and the links it produced (CSV + Slack text)
```

The library's unique key is the full URL. Saving a link that already exists returns the saved
one, restores it if it was archived, and files it under the current batch if it had none.
