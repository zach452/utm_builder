# Hark · UTM Builder

One place for every team to build tracking links that follow the **Hark x Darkroom UTM schema
(v1.6, 1 October 2026)**, plus a shared library of every link anyone has made and a registry of
Hark creator IDs. It's a Vite + React app with two Vercel Functions and Postgres. It deploys to
Vercel straight from this repo.

| Tab | What it's for |
| --- | --- |
| **Single link** | One link at a time. Pick a channel, and its source / medium pair plus the platform's ID macros fill themselves in. Every field suggests values the team has already used. |
| **Bulk / creator list** | Paste a creator list from Slack, rows from Google Sheets, or upload a CSV or Excel file. Each line or row becomes a link. Pick the link type (link in bio, paid post, DM), review, then save, copy for Slack or Sheets, or download a CSV. |
| **Library** | Every saved link, newest first, grouped into batches. Search by creator, handle, CT ID, campaign or URL. **Reuse** opens a link in the builder. Links built before the schema are flagged as **Old format** and can be archived together. |
| **Creators** | The creator registry: one Hark creator ID (`CT0042`) per creator account, with its handle on each platform. IDs are assigned the first time a creator gets a link. Import Hark's own IDs from CSV, edit, download. |
| **Conventions** | The schema's rules, every parameter and every channel, generated from the config. |

## Creator links (how the creator team uses it)

1. **Bulk / creator list** → paste the list exactly as it's written, e.g.
   `* Olivia Zhang (IG @oliviazhangofficial, TT @livviazhang) – TikTok and IG – link in bio`.
2. Pick the **link type**: link in bio, paid post or DM. Check the campaign name.
3. Fix anything flagged, then **Save**. New creators are registered with the next CT number, and
   existing creators keep theirs. **Copy for Slack** gives a reply grouped by creator.

Each link is one creator on one platform:

```
https://hark.com/?utm_source=tiktok&utm_medium=influencer_linkinbio&utm_campaign=us_signup_creators_202610&utm_content=livviazhang&hark_creator_id=CT0014
```

| | Link in bio | Paid influencer post | Direct message |
| --- | --- | --- | --- |
| `utm_source` | platform the bio is on | platform the post runs on | platform of the organic post |
| `utm_medium` | `influencer_linkinbio` | `paid_influencer` | `influencer_directmessage` |
| `utm_content` | handle on that platform | handle + deliverable, e.g. `handle_food_demo_reel_v1` | handle |
| `hark_creator_id` | required | required | required |

Handles go in `utm_content` because not every creator has a first and last name, and some
accounts are run by two people. The `hark_creator_id` ties a creator's links together across
platforms and link types, including paid amplification (Meta / TikTok Ads channels).

Strikethrough lines are left out, including a rich-text paste from Slack, Notion or Docs. A
missing handle is flagged. Rows that match a registered creator by handle (or by name when no
handle is given) reuse that creator's ID.

## Conventions

The full rules are on the **Conventions** tab. The key ones:

- Values are lowercase a–z, 0–9 and underscores. Spaces, hyphens, dots and `@` become underscores,
  and repeats collapse (`US-Signup Food.202610` → `us_signup_food_202610`). Platform IDs, referral
  codes and macros are kept exactly.
- Campaigns are `{market}_{objective}_{theme}_{yyyymm}`, e.g. `us_signup_food_202610`, and never
  change after launch. Both builders have a name helper.
- Paid channels carry the platform's IDs in `hark_ad_campaign_id`, `hark_ad_group_id`, `hark_ad_id`,
  `hark_ad_creative_id`, `hark_asset_group_id` and `hark_ad_site`, plus the optional GA4 `utm_id`.
  The schema's own link examples are reproduced exactly by `src/lib/utm.test.ts`.
- Parameters always appear in the same order, so the same inputs always produce the same URL.
  That's how duplicates are caught.

Everything lives in `src/config/`:

| File | Change it to… |
| --- | --- |
| `channels.ts` | add a channel, change a source / medium pair, update an ad platform's macros |
| `params.ts` | add a parameter or change its format rule (it shows up in every view) |
| `app.ts` | change the default destination, the creator campaign name, the teams or the use-case suggestions |

Push the change and Vercel redeploys in about a minute. The **Conventions** tab updates itself.
Snapchat, Pinterest and Microsoft Ads aren't in the schema yet. The builder warns when they're
used, because Hark's backend keeps those links but flags the source as unmapped.

## Deploying on Vercel

1. In Vercel, go to **Add New → Project** and import this repo. `vercel.json` sets everything.
2. **Turn on the shared library and the creator registry:** in the project, go to **Storage →
   Create Database → Neon** and connect it to the project for all environments. That adds
   `DATABASE_URL`. Redeploy. The tables are created on first use. Without a database the app still
   builds and copies links, but it can't save them or assign creator IDs, and it says so.
3. Optional: set `APP_PASSWORD` to put the whole app, including its API, behind a browser
   password prompt (any username works). Vercel Deployment Protection works too.

> Anyone who can open the URL can read and add to the library. Set `APP_PASSWORD` or turn on
> Deployment Protection before sharing the link outside the team.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173. Uses an embedded Postgres in .data/, no setup needed
npm test           # schema rules + link examples, paste parser, creator matching, both APIs against Postgres
npm run build      # typecheck + production build
```

To develop against the real database, run `vercel env pull` and start with
`DATABASE_URL=… npm run dev`.

## How it fits together

```
src/config/          channels, parameters, teams: the schema, in one place
src/lib/utm.ts       normalise and check values against the schema, build a link
src/lib/dump.ts      paste parser: creator lists, Sheets/CSV/Excel tables, plain lists
src/lib/creators.ts  match pasted creators to the registry before saving
src/views/           Single · Bulk · Library · Creators · Conventions
api/links.ts         GET / POST / PATCH / DELETE /api/links    → utm_links table
api/creators.ts      GET / POST / PATCH /api/creators          → utm_creators table
api/_db.ts           shared connection and schema (not a function of its own)
examples/            the 21 Oct 2026 creator request, its links (CSV + Slack text) and creator IDs
```

The library's unique key is the full URL. Saving a link that already exists returns the saved
one, restores it if it was archived, and files it under the current batch if it had none.
