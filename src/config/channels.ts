import type { ParamKey, Params } from './params';

/**
 * The channel taxonomy: one entry per kind of link the team builds. Picking a channel fills in
 * the medium, suggests sources and, for ad platforms, drops in the platform's dynamic macros so
 * one link works for every ad. To add a channel, add an entry here and push; Vercel redeploys.
 *
 * Values in `defaults` may contain platform macros ({{ad.name}}, __CID__, {keyword}). Those are
 * kept exactly as written. Everything else is lowercased and underscored when the link is built.
 */
export type ChannelGroup =
  | 'Paid social'
  | 'Paid search'
  | 'Paid media'
  | 'Creators & partners'
  | 'Owned & organic';

export const CHANNEL_GROUPS: ChannelGroup[] = [
  'Creators & partners',
  'Paid social',
  'Paid search',
  'Paid media',
  'Owned & organic',
];

export interface Channel {
  id: string;
  label: string;
  group: ChannelGroup;
  description: string;
  /** Params shown up front for this channel, in order. The rest sit under "More fields". */
  fields: ParamKey[];
  /** Filled in when the channel is picked. */
  defaults: Params;
  /** Suggested values for each field, on top of the values the team has already used. */
  options?: Partial<Record<ParamKey, string[]>>;
  /** Required on top of source, medium and campaign. */
  required?: ParamKey[];
  /**
   * Ad platforms take the query string in their own field. When set, the builder also shows the
   * parameters on their own, and this says where to paste them.
   */
  paramsField?: string;
  /**
   * Bulk mode: templates that read the pasted columns, written as [column]. `label` names each
   * link in the library.
   */
  bulk?: Params & { label?: string };
  notes?: string[];
}

const SOCIAL_PLATFORMS = ['tiktok', 'instagram', 'youtube', 'facebook', 'x', 'threads', 'linkedin', 'pinterest', 'snapchat', 'reddit'];

const AD_FIELDS: ParamKey[] = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_adgroup', 'utm_ad', 'utm_content', 'utm_creative', 'utm_usecase'];
const SEARCH_FIELDS: ParamKey[] = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_adgroup', 'utm_ad', 'utm_term', 'utm_content', 'utm_usecase'];
const BASIC_FIELDS: ParamKey[] = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_usecase'];

export const CHANNELS: Channel[] = [
  // ---------- Creators & partners ----------
  {
    id: 'creator',
    label: 'Creator (organic post)',
    group: 'Creators & partners',
    description: 'A creator posting on their own account: link in bio, description, comment, story.',
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_creative', 'utm_usecase'],
    defaults: { utm_medium: 'creator', utm_campaign: 'creator_always_on', utm_term: 'link_in_bio' },
    options: {
      utm_source: SOCIAL_PLATFORMS,
      utm_term: ['link_in_bio', 'description', 'comment', 'pinned_comment', 'story', 'caption'],
    },
    required: ['utm_content'],
    bulk: {
      label: '[name] · [platform]',
      utm_source: '[platform]',
      utm_content: '[handle]',
      utm_term: '[placement]',
    },
    notes: [
      'Content is the creator handle on the platform the link is posted on, without the @.',
      'Term is where the link sits, so a bio link and a comment link from the same creator stay separate.',
      'Paid amplification of creator posts (Spark Ads, Partnership Ads) uses the Meta or TikTok Ads channel, with the handle in Creative.',
    ],
  },
  {
    id: 'affiliate',
    label: 'Affiliate',
    group: 'Creators & partners',
    description: 'Affiliate networks and commission-based partners.',
    fields: BASIC_FIELDS,
    defaults: { utm_medium: 'affiliate' },
    required: ['utm_content'],
    notes: ['Source is the network or partner. Content is the publisher or partner ID.'],
  },
  {
    id: 'partnership',
    label: 'Partnership & co-marketing',
    group: 'Creators & partners',
    description: 'Brand partners, integrations, co-marketing placements.',
    fields: BASIC_FIELDS,
    defaults: { utm_medium: 'partnership' },
  },
  {
    id: 'sponsorship',
    label: 'Sponsorship (newsletter, event)',
    group: 'Creators & partners',
    description: 'Paid newsletter placements, event sponsorships and community sponsorships.',
    fields: BASIC_FIELDS,
    defaults: { utm_medium: 'sponsorship' },
    options: { utm_content: ['primary', 'secondary', 'classified', 'dedicated_send'] },
    notes: ['Source is the newsletter or event name. Content is the placement.'],
  },
  {
    id: 'pr',
    label: 'PR & press',
    group: 'Creators & partners',
    description: 'Press coverage, product round-ups and reviews.',
    fields: BASIC_FIELDS,
    defaults: { utm_medium: 'pr' },
    notes: ['Source is the publication, e.g. the_verge.'],
  },

  // ---------- Paid social ----------
  {
    id: 'meta_ads',
    label: 'Meta Ads (Facebook & Instagram)',
    group: 'Paid social',
    description: 'One set of parameters for every Meta ad. Meta fills in the names at click time.',
    fields: AD_FIELDS,
    defaults: {
      utm_source: 'facebook',
      utm_medium: 'paid_social',
      utm_campaign: '{{campaign.name}}',
      utm_adgroup: '{{adset.name}}',
      utm_ad: '{{ad.name}}',
      utm_content: '{{ad.id}}',
    },
    options: { utm_source: ['facebook', 'instagram', '{{site_source_name}}'] },
    paramsField: 'Ads Manager → ad → Tracking → URL parameters',
    notes: [
      'Meta keeps the name an item had when it was first published, so renaming later does not change the value.',
      "Dynamic parameters don't work on app-install objectives. Those clicks go to the store, not a web page.",
    ],
  },
  {
    id: 'tiktok_ads',
    label: 'TikTok Ads',
    group: 'Paid social',
    description: 'One set of parameters for every TikTok ad, including Spark Ads.',
    fields: AD_FIELDS,
    defaults: {
      utm_source: 'tiktok',
      utm_medium: 'paid_social',
      utm_campaign: '__CAMPAIGN_NAME__',
      utm_adgroup: '__AID_NAME__',
      utm_ad: '__CID_NAME__',
      utm_content: '__CID__',
    },
    paramsField: 'TikTok Ads Manager → ad → URL parameters',
  },
  {
    id: 'snapchat_ads',
    label: 'Snapchat Ads',
    group: 'Paid social',
    description: 'Snapchat ads.',
    fields: AD_FIELDS,
    defaults: {
      utm_source: 'snapchat',
      utm_medium: 'paid_social',
      utm_campaign: '{{campaign.name}}',
      utm_adgroup: '{{adSet.name}}',
      utm_ad: '{{creative.name}}',
      utm_content: '{{ad.id}}',
    },
    paramsField: 'Snapchat Ads Manager → ad → URL parameters',
    notes: ['Snapchat has no ad-name macro; {{creative.name}} is the closest. Mind the capital S in {{adSet.name}}.'],
  },
  {
    id: 'reddit_ads',
    label: 'Reddit Ads',
    group: 'Paid social',
    description: 'Reddit promoted posts and conversation ads.',
    fields: AD_FIELDS,
    defaults: { utm_source: 'reddit', utm_medium: 'paid_social' },
    notes: ["Reddit's macros are only documented for catalog ads and click trackers, so type the campaign, ad group and ad names in."],
  },
  {
    id: 'pinterest_ads',
    label: 'Pinterest Ads',
    group: 'Paid social',
    description: 'Pinterest promoted pins.',
    fields: AD_FIELDS,
    defaults: {
      utm_source: 'pinterest',
      utm_medium: 'paid_social',
      utm_campaign: '{campaign_name}',
      utm_adgroup: '{ad_group_name}',
      utm_content: '{adid}',
    },
    paramsField: 'Pinterest Ads Manager → ad → Destination URL',
    notes: [
      'Pinterest has no ad-name macro, so Ad is left for you to type; Content carries the Pin promotion ID.',
      'Pinterest now adds its own utm_campaign and utm_content unless default UTMs are turned off in the ad account. Turn them off so these values are the ones that land.',
    ],
  },
  {
    id: 'linkedin_ads',
    label: 'LinkedIn Ads',
    group: 'Paid social',
    description: 'LinkedIn sponsored content and thought-leader ads.',
    fields: AD_FIELDS,
    defaults: {
      utm_source: 'linkedin',
      utm_medium: 'paid_social',
      utm_campaign: '{{CAMPAIGN_GROUP_NAME}}',
      utm_adgroup: '{{CAMPAIGN_NAME}}',
      utm_content: '{{CREATIVE_ID}}',
    },
    paramsField: 'Campaign Manager → campaign → URL parameters',
    notes: [
      "LinkedIn's campaign group is the campaign level elsewhere, and its campaign is the ad group level.",
      'Not supported on Conversation or Message Ads.',
    ],
  },
  {
    id: 'x_ads',
    label: 'X Ads',
    group: 'Paid social',
    description: 'Promoted posts on X.',
    fields: AD_FIELDS,
    defaults: { utm_source: 'x', utm_medium: 'paid_social' },
    notes: ['X has no documented URL macros, so type the campaign, ad group and ad names in.'],
  },

  // ---------- Paid search ----------
  {
    id: 'google_search',
    label: 'Google Ads — Search',
    group: 'Paid search',
    description: 'Search campaigns. Google fills in the IDs and keyword at click time.',
    fields: SEARCH_FIELDS,
    defaults: {
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: '{campaignid}',
      utm_adgroup: '{adgroupid}',
      utm_ad: '{creative}',
      utm_term: '{keyword}',
    },
    paramsField: 'Google Ads → campaign or account settings → Final URL suffix',
    notes: [
      'Google has no macro for campaign or ad group names, so the IDs go in and map back to names in Google Ads. To see a readable name instead, type it into Campaign and set the suffix on that campaign.',
      'Keep auto-tagging (gclid) on. UTMs sit alongside it.',
    ],
  },
  {
    id: 'microsoft_search',
    label: 'Microsoft Ads — Search',
    group: 'Paid search',
    description: 'Bing search campaigns.',
    fields: SEARCH_FIELDS,
    defaults: {
      utm_source: 'bing',
      utm_medium: 'cpc',
      utm_campaign: '{Campaign}',
      utm_adgroup: '{AdGroup}',
      utm_ad: '{AdId}',
      utm_term: '{keyword}',
    },
    paramsField: 'Microsoft Advertising → account, campaign or ad group → Final URL suffix',
  },

  // ---------- Paid media ----------
  {
    id: 'youtube_ads',
    label: 'YouTube Ads',
    group: 'Paid media',
    description: 'Video campaigns on YouTube bought through Google Ads.',
    fields: AD_FIELDS,
    defaults: {
      utm_source: 'youtube',
      utm_medium: 'paid_video',
      utm_campaign: '{campaignid}',
      utm_adgroup: '{adgroupid}',
      utm_ad: '{creative}',
    },
    paramsField: 'Google Ads → campaign settings → Final URL suffix',
  },
  {
    id: 'google_display',
    label: 'Google Ads — Display & Demand Gen',
    group: 'Paid media',
    description: 'Display, Demand Gen and Performance Max placements outside search.',
    fields: AD_FIELDS,
    defaults: {
      utm_source: 'google',
      utm_medium: 'display',
      utm_campaign: '{campaignid}',
      utm_adgroup: '{adgroupid}',
      utm_ad: '{creative}',
    },
    paramsField: 'Google Ads → campaign settings → Final URL suffix',
  },
  {
    id: 'programmatic',
    label: 'Programmatic display',
    group: 'Paid media',
    description: 'DSP and ad network buys.',
    fields: AD_FIELDS,
    defaults: { utm_medium: 'display' },
    options: { utm_source: ['stackadapt', 'the_trade_desk', 'dv360', 'amazon_dsp'] },
    notes: ['Source is the DSP or network. Most DSPs have their own macros; paste them into Ad group and Ad.'],
  },
  {
    id: 'ctv',
    label: 'CTV & streaming video',
    group: 'Paid media',
    description: 'Connected TV and streaming video buys (usually reached by QR code or vanity URL).',
    fields: BASIC_FIELDS,
    defaults: { utm_medium: 'ctv' },
  },
  {
    id: 'audio',
    label: 'Podcast & audio',
    group: 'Paid media',
    description: 'Host-read podcast ads, streaming audio and radio.',
    fields: BASIC_FIELDS,
    defaults: { utm_medium: 'audio' },
    options: { utm_content: ['host_read', 'pre_roll', 'mid_roll', 'post_roll', 'show_notes'] },
    notes: ['Source is the show or network. Content is the ad position.'],
  },

  // ---------- Owned & organic ----------
  {
    id: 'organic_social',
    label: 'Organic social (Hark accounts)',
    group: 'Owned & organic',
    description: "Posts on Hark's own social accounts, plus community posts (Reddit, Discord).",
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_usecase'],
    defaults: { utm_medium: 'organic_social', utm_term: 'link_in_bio' },
    options: {
      utm_source: [...SOCIAL_PLATFORMS, 'discord'],
      utm_term: ['link_in_bio', 'post', 'story', 'comment', 'profile', 'description'],
    },
  },
  {
    id: 'email',
    label: 'Email',
    group: 'Owned & organic',
    description: 'Newsletters, lifecycle and transactional email.',
    fields: BASIC_FIELDS,
    defaults: { utm_medium: 'email' },
    options: {
      utm_source: ['newsletter', 'lifecycle', 'transactional', 'product_update'],
      utm_content: ['hero_cta', 'body_link', 'footer', 'ps'],
    },
    notes: ['Source is the list or program. Content is the link position in the email.'],
  },
  {
    id: 'sms',
    label: 'SMS',
    group: 'Owned & organic',
    description: 'Text message campaigns.',
    fields: BASIC_FIELDS,
    defaults: { utm_medium: 'sms' },
  },
  {
    id: 'push',
    label: 'Push notification',
    group: 'Owned & organic',
    description: 'Web or app push that opens a web page.',
    fields: BASIC_FIELDS,
    defaults: { utm_medium: 'push' },
  },
  {
    id: 'qr',
    label: 'QR code & offline',
    group: 'Owned & organic',
    description: 'Print, events, OOH and packaging.',
    fields: BASIC_FIELDS,
    defaults: { utm_medium: 'qr' },
    notes: ['Source is the placement, e.g. sf_billboard or launch_event.'],
  },
  {
    id: 'other',
    label: 'Other',
    group: 'Owned & organic',
    description: "Anything the channels above don't cover. Every field is open.",
    fields: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_adgroup', 'utm_ad', 'utm_creative', 'utm_usecase'],
    defaults: {},
  },
];

export const CHANNEL_BY_ID: Record<string, Channel> = Object.fromEntries(CHANNELS.map((c) => [c.id, c]));

export const channelOf = (id: string): Channel => CHANNEL_BY_ID[id] ?? CHANNEL_BY_ID.other;

/**
 * Canonical source names. Whatever someone types or pastes ("IG", "Tik Tok", "fb") is stored as
 * the canonical value, so one platform never shows up as three sources in reporting.
 */
export const SOURCE_ALIASES: Record<string, string> = {
  ig: 'instagram',
  insta: 'instagram',
  instagram: 'instagram',
  tt: 'tiktok',
  tik_tok: 'tiktok',
  tiktok: 'tiktok',
  fb: 'facebook',
  facebook: 'facebook',
  meta: 'facebook',
  yt: 'youtube',
  youtube: 'youtube',
  twitter: 'x',
  'x.com': 'x',
  snap: 'snapchat',
  li: 'linkedin',
  linked_in: 'linkedin',
  microsoft: 'bing',
  microsoft_ads: 'bing',
  google_ads: 'google',
  adwords: 'google',
};
