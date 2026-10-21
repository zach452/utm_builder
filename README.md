# Hark · UTM Builder

One place for every team to build tracking links that follow the **Hark x Darkroom UTM schema
(v1.6, 1 October 2026, the version shared with Hark)**, plus a shared library of every link
anyone has made. It's a Vite + React app with one Vercel Function and Postgres, and it deploys to
Vercel straight from this repo.

| Tab | What it's for |
| --- | --- |
| **Single link** | One link at a time. Pick a channel, and its source / medium pair plus the platform's ID macros fill themselves in. Every field suggests values the team has already used. |
| **Bulk / creator list** | Paste a creator list from Slack, rows from Google Sheets, or upload a CSV or Excel file. Each line or row becomes a link. Review, then save, copy for Slack or Sheets, or download a CSV. |
| **Library** | Every saved link, newest first, grouped into batches. Search by creator name, handle, campaign or URL. **Reuse** opens a link in the builder. Links that don't match the current conventions are flagged as **Off schema** and can be archived together. |
| **Conventions** | The rules, every parameter and every channel, generated from the config. |

## Creator links (how the creator team uses it)

1. **Bulk / creator list** → paste the list exactly as it's written, e.g.
   `* Olivia Zhang (IG @oliviazhangofficial, TT @livviazhang) – TikTok and IG – link in bio`.
2. Leave the link type on **Creator** and check the campaign name.
3. Fix anything flagged, then **Save**. **Copy for Slack** gives a reply grouped by creator.

Each link is one creator on one platform, using the schema's `platform / creator` pair. The
creator's handle in `utm_content` is what says which creator it is:

```
https://hark.com/?utm_source=tiktok&utm_medium=creator&utm_campaign=us_signup_creators_202610&utm_content=livviazhang
```

| Parameter | Value |
| --- | --- |
| `utm_source` | the platform the link is on: `instagram`, `tiktok`, `youtube` (never the link-in-bio tool) |
| `utm_medium` | `creator` |
| `utm_campaign` | `{market}_{objective}_{theme}_{yyyymm}` |
| `utm_content` | the creator's handle on that platform, without the @ (required) |

Handles are used because not every creator has a first and last name, and some accounts are run
by two people. The schema's `hark_creator_id` (a `CT0042`-style key) is **not used**: the handle
is the identifier. A creator with different handles on different platforms (Olivia Zhang is
`oliviazhangofficial` on Instagram and `livviazhang` on TikTok) gets a different `utm_content`
on each. The library keeps the creator's name with every link, so they're easy to find together.

A creator post boosted through a Hark ad account uses the Meta or TikTok Ads channel
(`meta / paid_social`), with the handle in `utm_content`, e.g. `livviazhang_food_demo_v1`.

The `influencer_linkinbio`, `paid_influencer` and `influencer_directmessage` mediums from
Darkroom's internal draft aren't in the schema shared with Hark. They're in the tool, marked
**(proposed)**, with a warning that Hark will flag them as unmapped. Once they're added to the
schema, remove `unlisted: true` from them in `src/config/channels.ts`.

Strikethrough lines are left out, including a rich-text paste from Slack, Notion or Docs. A
missing handle is flagged. When you build a creator link, the tool shows whether that handle has
been used before, and for whom.

## Conventions

The full rules are on the **Conventions** tab. The key ones:

- Values are lowercase a–z, 0–9 and underscores. Spaces, hyphens, dots and `@` become
  underscores, and repeats collapse: `US-Signup Food.202610` → `us_signup_food_202610`,
  `@khani.trendy` → `khani_trendy`. Platform IDs, referral codes and macros are kept exactly.
- Campaigns are `{market}_{objective}_{theme}_{yyyymm}`, e.g. `us_signup_food_202610`, and never
  change after launch. Both builders have a helper for building the name.
- Paid channels carry the platform's IDs in `hark_ad_campaign_id`, `hark_ad_group_id`, `hark_ad_id`,
  `hark_ad_creative_id`, `hark_asset_group_id` and `hark_ad_site`, plus the optional GA4 `utm_id`.
  `src/lib/utm.test.ts` checks that the builder reproduces the schema's own link examples exactly.
- Parameters always appear in the same order, so the same inputs always produce the same URL.
  That's how duplicates are caught.

Everything lives in `src/config/`:

| File | Change it to… |
| --- | --- |
| `channels.ts` | add a channel, change a source / medium pair, update an ad platform's macros |
| `params.ts` | add a parameter or change its format rule (it shows up in every view) |
| `app.ts` | change the default destination, the creator campaign name, the teams or the use-case suggestions |

Push the change and Vercel redeploys in about a minute. The **Conventions** tab updates itself.
Snapchat, Pinterest, Microsoft Ads, the lifecycle row and the proposed influencer mediums aren't
in the schema yet. The builder warns when they're used, because Hark's backend keeps those links
but flags them as unmapped.

## Deploying on Vercel

1. In Vercel, go to **Add New → Project** and import this repo. `vercel.json` sets everything.
2. **Turn on the shared library:** in the project, go to **Storage → Create Database → Neon** and
   connect it to the project for all environments. That adds `DATABASE_URL`. Redeploy. The table
   is created on first use. Without a database the app still builds and copies links, but it
   can't save them, and it says so.
3. Optional: set `APP_PASSWORD` to put the whole app, including its API, behind a browser
   password prompt (any username works). Vercel Deployment Protection works too.

> Anyone who can open the URL can read and add to the library. Set `APP_PASSWORD` or turn on
> Deployment Protection before sharing the link outside the team.

## Local development

```bash
npm install
npm run dev        # http://localhost:5173. Uses an embedded Postgres in .data/, no setup needed
npm test           # schema rules + link examples, paste parser, the API against Postgres
npm run build      # typecheck + production build
```

To develop against the real database, run `vercel env pull` and start with
`DATABASE_URL=… npm run dev`.

## How it fits together

```
src/config/        channels, parameters, teams: the schema, in one place
src/lib/utm.ts     normalise and check values against the schema, build a link
src/lib/dump.ts    paste parser: creator lists, Sheets/CSV/Excel tables, plain lists
src/views/         Single · Bulk · Library · Conventions
api/links.ts       GET / POST / PATCH / DELETE /api/links  → utm_links table
api/_db.ts         connection and schema (not a function of its own)
examples/          the 21 Oct 2026 creator request and its links (CSV + Slack text)
```

The library's unique key is the full URL. Saving a link that already exists returns the saved
one, restores it if it was archived, and files it under the current batch if it had none.
