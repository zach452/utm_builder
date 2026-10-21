import type { ParamKey, Params } from './params';

/**
 * The channel taxonomy, following the "Source & Medium" and "Link Examples" sheets of the
 * Hark x Darkroom UTM schema (v1.6, the EXT version shared with Hark). Picking a channel sets the source/medium pair and, for ad
 * platforms, drops the platform's ID macros into the hark_ad_* fields so one parameter string
 * works for every ad. To add or change a channel, edit this file and push; Vercel redeploys.
 *
 * Macros ({{ad.id}}, __CID__, {campaignid}) are kept exactly as written. Everything else is
 * cleaned to the schema's format when the link is built.
 */
export type ChannelGroup = 'Creators' | 'Paid social' | 'Paid search' | 'Paid video & programmatic' | 'Owned & organic';

export const CHANNEL_GROUPS: ChannelGroup[] = ['Creators', 'Paid social', 'Paid search', 'Paid video & programmatic', 'Owned & organic'];

export interface Channel {
  id: string;
  label: string;
  /** For tight spaces, e.g. the link-type switch in Bulk. */
  shortLabel?: string;
  group: ChannelGroup;
  description: string;
  /** Params shown up front for this channel, in order. The rest sit under "More fields". */
  fields: ParamKey[];
  /** Filled in when the channel is picked. */
  defaults: Params;
  /** Suggested values for each field, on top of the values the team has already used. */
  options?: Partial<Record<ParamKey, string[]>>;
  /** Sources the schema allows for this channel. Anything else gets a warning. */
  sources?: string[];
  /** Mediums the schema allows. Defaults to the channel's default medium. */
  mediums?: string[];
  /** Required on top of source, medium and campaign. */
  required?: ParamKey[];
  /**
   * Ad platforms take the query string in their own field. When set, the builder also shows the
   * parameters on their own, and this says where to paste them.
   */
  paramsField?: string;
  /** Bulk mode: templates that read pasted columns, written as [column]. `label` names each link. */
  bulk?: Params & { label?: string };
  /** Not in the schema yet: Hark's backend keeps the link but flags the source / medium as unmapped. */
  unlisted?: boolean;
  notes?: string[];
}

const CREATOR_PLATFORMS = ['instagram', 'tiktok', 'youtube'];
const SOCIAL_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'facebook', 'threads', 'reddit'];

const CREATOR_FIELDS: ParamKey[] = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'hark_use_case'];
const META_IDS: Params = {
  hark_ad_campaign_id: '{{campaign.id}}',
  hark_ad_group_id: '{{adset.id}}',
  hark_ad_id: '{{ad.id}}',
  hark_ad_site: '{{site_source_name}}',
  utm_id: '{{campaign.id}}',
};
const TIKTOK_IDS: Params = {
  hark_ad_campaign_id: '__CAMPAIGN_ID__',
  hark_ad_group_id: '__AID__',
  hark_ad_creative_id: '__CID__',
  hark_ad_site: '__PLACEMENT__',
  utm_id: '__CAMPAIGN_ID__',
};
const PAID_FIELDS: ParamKey[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'hark_use_case',
  'utm_content',
  'hark_ad_campaign_id',
  'hark_ad_group_id',
  'hark_ad_id',
];
const PLACEHOLDER_NOTE = 'No verified macros: paste the real campaign / ad group / ad IDs, or leave them out and note the reporting gap.';

export const CHANNELS: Channel[] = [
  // ---------- Creators ----------
  {
    id: 'creator',
    label: 'Creator',
    shortLabel: 'Creator',
    group: 'Creators',
    description: 'A creator sharing a Hark link from their own account: link in bio, post, story or DM. One link per creator per platform.',
    fields: CREATOR_FIELDS,
    defaults: { utm_medium: 'creator' },
    sources: CREATOR_PLATFORMS,
    options: { utm_source: CREATOR_PLATFORMS },
    required: ['utm_content'],
    bulk: { label: '[name] · [platform]', utm_source: '[platform]', utm_content: '[handle]' },
    notes: [
      'Source is the platform the link is on, not the link tool (Linktree, Beacons…).',
      'Content is the creator’s handle on that platform, without the @. It’s how each creator is identified, so it is required.',
      'Need to tell a bio link from a post or DM for the same creator? Add it after the handle, e.g. handle_story.',
      'Boosted or whitelisted through a Hark ad account? Use the Meta or TikTok Ads channel with the handle in Content.',
      'Link-in-bio tools can strip or rewrite parameters. Click the live link and check the tags arrive before the creator posts.',
    ],
  },
  // Proposed in Darkroom's internal draft of the schema, but not in the version shared with Hark.
  {
    id: 'influencer_linkinbio',
    label: 'Influencer link in bio (proposed)',
    shortLabel: 'Link in bio (proposed)',
    group: 'Creators',
    description: 'Links in a creator’s bio or link-in-bio page. Proposed medium, not in the Hark schema yet.',
    fields: CREATOR_FIELDS,
    defaults: { utm_medium: 'influencer_linkinbio' },
    sources: CREATOR_PLATFORMS,
    options: { utm_source: CREATOR_PLATFORMS },
    required: ['utm_content'],
    bulk: { label: '[name] · [platform]', utm_source: '[platform]', utm_content: '[handle]' },
    unlisted: true,
  },
  {
    id: 'paid_influencer',
    label: 'Paid influencer post (proposed)',
    shortLabel: 'Paid post (proposed)',
    group: 'Creators',
    description: 'Paid posts on the creator’s own account, one link per deliverable. Proposed medium, not in the Hark schema yet.',
    fields: CREATOR_FIELDS,
    defaults: { utm_medium: 'paid_influencer' },
    sources: CREATOR_PLATFORMS,
    options: { utm_source: CREATOR_PLATFORMS },
    required: ['utm_content'],
    bulk: { label: '[name] · [platform]', utm_source: '[platform]', utm_content: '[handle]' },
    unlisted: true,
    notes: ['Content is the handle plus the post or deliverable, e.g. [handle]_food_demo_reel_v1 in bulk.'],
  },
  {
    id: 'influencer_directmessage',
    label: 'Influencer direct message (proposed)',
    shortLabel: 'DM (proposed)',
    group: 'Creators',
    description: 'Links a creator sends in direct messages. Proposed medium, not in the Hark schema yet.',
    fields: CREATOR_FIELDS,
    defaults: { utm_medium: 'influencer_directmessage' },
    sources: CREATOR_PLATFORMS,
    options: { utm_source: CREATOR_PLATFORMS },
    required: ['utm_content'],
    bulk: { label: '[name] · [platform]', utm_source: '[platform]', utm_content: '[handle]' },
    unlisted: true,
  },

  // ---------- Paid social ----------
  {
    id: 'meta_ads',
    label: 'Meta Ads (Facebook & Instagram)',
    group: 'Paid social',
    description: 'Facebook and Instagram paid ads, including paid creator amplification (Partnership Ads).',
    fields: [...PAID_FIELDS, 'hark_ad_site', 'utm_id'],
    defaults: { utm_source: 'meta', utm_medium: 'paid_social', ...META_IDS },
    sources: ['meta'],
    paramsField: 'Ads Manager → ad → Tracking → URL parameters',
    notes: [
      'Paid creator amplification (Partnership Ads) stays meta / paid_social. Put the creator’s handle in Content, e.g. handle_food_demo_v1.',
      'Validate a served click: the ID macros should arrive as numbers, not as {{…}}.',
    ],
  },
  {
    id: 'tiktok_ads',
    label: 'TikTok Ads',
    group: 'Paid social',
    description: 'TikTok paid ads, including Spark Ads.',
    fields: [...PAID_FIELDS.filter((k) => k !== 'hark_ad_id'), 'hark_ad_creative_id', 'hark_ad_site', 'utm_id', 'hark_ad_id'],
    defaults: { utm_source: 'tiktok', utm_medium: 'paid_social', ...TIKTOK_IDS },
    sources: ['tiktok'],
    options: { hark_ad_id: ['__ADID_V2__'] },
    paramsField: 'TikTok Ads Manager → ad → URL parameters',
    notes: [
      '__CID__ is TikTok’s creative ID. On a real click, compare it to the ad ID in the TikTok export and record the join.',
      'Upgraded Smart+ ads: also set Platform ad ID to __ADID_V2__.',
      'Spark Ads: put the creator’s handle in Content, e.g. handle_food_demo_v1.',
    ],
  },
  {
    id: 'linkedin_ads',
    label: 'LinkedIn Ads',
    group: 'Paid social',
    description: 'LinkedIn paid ads.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'utm_content', 'hark_ad_campaign_id', 'hark_ad_group_id', 'hark_ad_creative_id', 'utm_id'],
    defaults: {
      utm_source: 'linkedin',
      utm_medium: 'paid_social',
      hark_ad_campaign_id: '{{CAMPAIGN_GROUP_ID}}',
      hark_ad_group_id: '{{CAMPAIGN_ID}}',
      hark_ad_creative_id: '{{CREATIVE_ID}}',
      utm_id: '{{CAMPAIGN_ID}}',
    },
    sources: ['linkedin'],
    paramsField: 'Campaign Manager → campaign → URL parameters',
    notes: ['LinkedIn campaign group → Hark campaign; LinkedIn campaign → Hark ad group; creative → creative.'],
  },
  {
    id: 'reddit_ads',
    label: 'Reddit Ads',
    group: 'Paid social',
    description: 'Reddit paid ads.',
    fields: PAID_FIELDS,
    defaults: { utm_source: 'reddit', utm_medium: 'paid_social' },
    sources: ['reddit'],
    notes: [PLACEHOLDER_NOTE],
  },
  {
    id: 'x_ads',
    label: 'X Ads',
    group: 'Paid social',
    description: 'X paid ads.',
    fields: PAID_FIELDS,
    defaults: { utm_source: 'x', utm_medium: 'paid_social' },
    sources: ['x'],
    notes: [PLACEHOLDER_NOTE],
  },
  {
    id: 'snapchat_ads',
    label: 'Snapchat Ads',
    group: 'Paid social',
    description: 'Snapchat paid ads.',
    fields: [...PAID_FIELDS, 'hark_ad_site'],
    defaults: {
      utm_source: 'snapchat',
      utm_medium: 'paid_social',
      hark_ad_campaign_id: '{{campaign.id}}',
      hark_ad_group_id: '{{adSet.id}}',
      hark_ad_id: '{{ad.id}}',
      hark_ad_site: '{{site_source_name}}',
    },
    unlisted: true,
    paramsField: 'Snapchat Ads Manager → ad → URL parameters',
  },
  {
    id: 'pinterest_ads',
    label: 'Pinterest Ads',
    group: 'Paid social',
    description: 'Pinterest paid ads.',
    fields: PAID_FIELDS,
    defaults: {
      utm_source: 'pinterest',
      utm_medium: 'paid_social',
      hark_ad_campaign_id: '{campaignid}',
      hark_ad_group_id: '{adgroupid}',
      hark_ad_id: '{adid}',
    },
    unlisted: true,
    notes: ['Turn off Pinterest’s automatic default UTMs so they don’t overwrite these.'],
  },

  // ---------- Paid search ----------
  {
    id: 'google_search',
    label: 'Google Ads — Search',
    group: 'Paid search',
    description: 'Google search campaigns.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'hark_ad_campaign_id', 'hark_ad_group_id', 'hark_ad_id', 'utm_term', 'hark_ad_site', 'utm_id'],
    defaults: {
      utm_source: 'google',
      utm_medium: 'paid_search',
      hark_ad_campaign_id: '{campaignid}',
      hark_ad_group_id: '{adgroupid}',
      hark_ad_id: '{creative}',
      utm_term: '{keyword}',
      hark_ad_site: '{network}',
      utm_id: '{campaignid}',
    },
    sources: ['google'],
    paramsField: 'Google Ads → campaign (or lower) → Final URL suffix, without the ?',
    notes: ['Keep auto-tagging (gclid) on alongside these tags. {creative} is the ad ID; {keyword} is the configured keyword, not search text.'],
  },
  {
    id: 'google_pmax',
    label: 'Google — Performance Max / mixed',
    group: 'Paid search',
    description: 'Performance Max and other genuinely mixed-format Google campaigns.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'hark_ad_campaign_id', 'hark_asset_group_id', 'hark_ad_site', 'utm_id'],
    defaults: {
      utm_source: 'google',
      utm_medium: 'cross_network',
      hark_ad_campaign_id: '{campaignid}',
      hark_asset_group_id: '{assetgroupid}',
      hark_ad_site: '{network}',
      utm_id: '{campaignid}',
    },
    sources: ['google'],
    paramsField: 'Google Ads → campaign → Final URL suffix, without the ?',
    notes: ['Asset group is not an ad group: leave the ad group and ad fields empty.'],
  },
  {
    id: 'microsoft_search',
    label: 'Microsoft Ads — Search',
    group: 'Paid search',
    description: 'Bing search campaigns.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'hark_ad_campaign_id', 'hark_ad_group_id', 'hark_ad_id', 'utm_term'],
    defaults: {
      utm_source: 'bing',
      utm_medium: 'paid_search',
      hark_ad_campaign_id: '{CampaignId}',
      hark_ad_group_id: '{AdGroupId}',
      hark_ad_id: '{AdId}',
      utm_term: '{keyword}',
    },
    unlisted: true,
    paramsField: 'Microsoft Advertising → campaign → Final URL suffix',
  },

  // ---------- Paid video & programmatic ----------
  {
    id: 'youtube_ads',
    label: 'YouTube (Google Ads)',
    group: 'Paid video & programmatic',
    description: 'YouTube campaigns bought through Google Ads. Source is google, the buying platform.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'hark_ad_campaign_id', 'hark_ad_group_id', 'hark_ad_id', 'utm_id'],
    defaults: {
      utm_source: 'google',
      utm_medium: 'paid_video',
      hark_ad_campaign_id: '{campaignid}',
      hark_ad_group_id: '{adgroupid}',
      hark_ad_id: '{creative}',
      utm_id: '{campaignid}',
    },
    sources: ['google'],
    paramsField: 'Google Ads → campaign → Final URL suffix, without the ?',
  },
  {
    id: 'online_video',
    label: 'Online video (DSP / publisher)',
    group: 'Paid video & programmatic',
    description: 'Non-CTV online video bought through a DSP or direct publisher.',
    fields: PAID_FIELDS,
    defaults: { utm_medium: 'paid_video' },
    options: { utm_source: ['dv360', 'the_trade_desk'] },
    notes: ['Source is the actual buying platform. ' + PLACEHOLDER_NOTE],
  },
  {
    id: 'ctv',
    label: 'CTV',
    group: 'Paid video & programmatic',
    description: 'Dedicated connected-TV campaigns, usually reached by QR code or vanity URL.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'hark_ad_campaign_id', 'hark_ad_creative_id'],
    defaults: { utm_medium: 'ctv' },
    options: { utm_source: ['dv360', 'the_trade_desk'] },
    notes: ['A printed or on-screen QR can’t expand macros: put the real campaign and creative IDs in.'],
  },
  {
    id: 'audio',
    label: 'Streaming audio / podcast',
    group: 'Paid video & programmatic',
    description: 'Streaming audio or podcast advertising.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'utm_content', 'hark_ad_campaign_id'],
    defaults: { utm_medium: 'audio' },
    notes: ['Source is the show or seller for a direct sponsorship, or the DSP for a DSP buy.'],
  },
  {
    id: 'programmatic_display',
    label: 'Programmatic — display',
    group: 'Paid video & programmatic',
    description: 'Programmatic display buys.',
    fields: PAID_FIELDS,
    defaults: { utm_medium: 'display' },
    options: { utm_source: ['dv360', 'the_trade_desk'] },
    notes: ['Source is the actual DSP. ' + PLACEHOLDER_NOTE],
  },
  {
    id: 'programmatic_native',
    label: 'Programmatic — native',
    group: 'Paid video & programmatic',
    description: 'Programmatic native buys.',
    fields: PAID_FIELDS,
    defaults: { utm_medium: 'native' },
    options: { utm_source: ['dv360', 'the_trade_desk'] },
    notes: ['Source is the actual DSP. ' + PLACEHOLDER_NOTE],
  },

  // ---------- Owned & organic ----------
  {
    id: 'lifecycle',
    label: 'Lifecycle (email, SMS, push) (proposed)',
    group: 'Owned & organic',
    description: 'Onboarding, reactivation and product-update sends to existing users.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'utm_content'],
    defaults: { utm_source: 'hark_lifecycle', utm_medium: 'email' },
    sources: ['hark_lifecycle'],
    mediums: ['email', 'sms', 'push'],
    unlisted: true,
    options: { utm_medium: ['email', 'sms', 'push'] },
    required: ['utm_content'],
    notes: ['Medium is the send format. Content is the flow or message name, e.g. reactivation_day30_v1.'],
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    group: 'Owned & organic',
    description: 'The Hark newsletter.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'utm_content'],
    defaults: { utm_source: 'hark_newsletter', utm_medium: 'email' },
    sources: ['hark_newsletter'],
  },
  {
    id: 'organic_social',
    label: 'Organic social (Hark accounts)',
    group: 'Owned & organic',
    description: 'Posts on Hark’s own social accounts.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'utm_content'],
    defaults: { utm_medium: 'organic_social' },
    options: { utm_source: SOCIAL_PLATFORMS },
  },
  {
    id: 'founder',
    label: 'Founder posts',
    group: 'Owned & organic',
    description: 'Links shared by Hark’s founder on their own accounts.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'utm_content'],
    defaults: { utm_medium: 'founder' },
    options: { utm_source: SOCIAL_PLATFORMS },
  },
  {
    id: 'community',
    label: 'Community',
    group: 'Owned & organic',
    description: 'Community posts: Discord, Reddit communities, forums. Source is the community host.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'utm_content'],
    defaults: { utm_medium: 'community' },
    options: { utm_source: ['discord', 'reddit', 'slack'] },
  },
  {
    id: 'earned_pr',
    label: 'Earned PR',
    group: 'Owned & organic',
    description: 'Press coverage and reviews. Source is the outlet.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'utm_content'],
    defaults: { utm_medium: 'earned_pr' },
  },
  {
    id: 'referral',
    label: 'Referral invite',
    group: 'Owned & organic',
    description: 'Hark invite and referral links.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_referral_code'],
    defaults: { utm_source: 'hark_invite', utm_medium: 'referral' },
    sources: ['hark_invite'],
    required: ['hark_referral_code'],
  },
  {
    id: 'other',
    label: 'Other',
    group: 'Owned & organic',
    description: "Anything the channels above don't cover. Values not in the schema are kept but flagged as unmapped by Hark.",
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'hark_use_case', 'utm_content'],
    defaults: {},
    unlisted: true,
  },
];

export const CHANNEL_BY_ID: Record<string, Channel> = Object.fromEntries(CHANNELS.map((c) => [c.id, c]));

export const channelOf = (id: string): Channel => CHANNEL_BY_ID[id] ?? CHANNEL_BY_ID.other;

/** Channels for a creator's own account, identified by the handle in utm_content. */
export const isCreatorChannel = (c: Channel): boolean => c.group === 'Creators';

/** Journeys that have no web link to build. Shown on the Conventions tab. */
export const NO_LINK_CHANNELS = [
  {
    label: 'Apple Search Ads',
    pair: 'apple_ads / app_acq',
    note: 'Native App Store ad → install. Attributed through Apple AdServices or the MMP, not a UTM link.',
  },
];

/**
 * Canonical source names. Whatever someone types or pastes ("IG", "Tik Tok") is stored as the
 * canonical value, so one platform never shows up as three sources in reporting.
 */
export const SOURCE_ALIASES: Record<string, string> = {
  ig: 'instagram',
  insta: 'instagram',
  tt: 'tiktok',
  tik_tok: 'tiktok',
  yt: 'youtube',
  fb: 'facebook',
  twitter: 'x',
  x_com: 'x',
  snap: 'snapchat',
  linked_in: 'linkedin',
  microsoft: 'bing',
  microsoft_ads: 'bing',
  google_ads: 'google',
  adwords: 'google',
  apple_search_ads: 'apple_ads',
  ttd: 'the_trade_desk',
};
