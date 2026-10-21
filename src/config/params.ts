/**
 * The URL parameters a link can carry, following the Hark x Darkroom UTM schema (v1.6,
 * 1 Oct 2026). Order is fixed so the same inputs always produce the same URL, which is how
 * duplicates are detected; it matches the schema's link examples. To add a parameter, add it
 * here; every view picks it up.
 */
export const PARAM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'hark_use_case',
  'utm_content',
  'hark_creator_id',
  'hark_creative_id',
  'hark_landing_page_id',
  'hark_experiment_id',
  'hark_referral_code',
  'hark_ad_campaign_id',
  'hark_ad_group_id',
  'hark_ad_id',
  'hark_ad_creative_id',
  'hark_asset_group_id',
  'utm_term',
  'hark_ad_site',
  'utm_id',
] as const;

export type ParamKey = (typeof PARAM_KEYS)[number];
export type Params = Partial<Record<ParamKey, string>>;

/**
 * How a value is cleaned and checked:
 *  - slug: lowercase a–z, 0–9, underscore (anything else becomes _, repeats collapse)
 *  - term: lowercase, spaces allowed (URL-encoded)
 *  - hark_id: Hark key with a fixed prefix, e.g. CT0042
 *  - code: exact case, e.g. a referral code
 *  - platform_id: opaque platform ID or macro, kept exactly as written
 */
export type ParamKind = 'slug' | 'term' | 'hark_id' | 'code' | 'platform_id';

export interface ParamDef {
  key: ParamKey;
  label: string;
  kind: ParamKind;
  max: number;
  /** For hark_id: the prefix, e.g. CT. */
  prefix?: string;
  /** Required on every link, whatever the channel. */
  required: boolean;
  /** When the schema says to use it. */
  when: string;
  help: string;
  example: string;
}

const def = (d: Omit<ParamDef, 'required'> & { required?: boolean }): ParamDef => ({ required: false, ...d });

export const PARAMS: Record<ParamKey, ParamDef> = {
  utm_source: def({
    key: 'utm_source',
    label: 'Source',
    kind: 'slug',
    max: 64,
    required: true,
    when: 'Every link',
    help: 'Who bought or sent the traffic: the buying platform, publisher, or the social platform a creator posts on.',
    example: 'meta',
  }),
  utm_medium: def({
    key: 'utm_medium',
    label: 'Medium',
    kind: 'slug',
    max: 64,
    required: true,
    when: 'Every link',
    help: 'Type of traffic. Comes from the channel.',
    example: 'paid_social',
  }),
  utm_campaign: def({
    key: 'utm_campaign',
    label: 'Campaign',
    kind: 'slug',
    max: 256,
    required: true,
    when: 'Every link',
    help: '{market}_{objective}_{theme}_{yyyymm}. Keep it unchanged after launch.',
    example: 'us_signup_food_202610',
  }),
  hark_use_case: def({
    key: 'hark_use_case',
    label: 'Use case',
    kind: 'slug',
    max: 64,
    when: 'When a use case is promoted',
    help: 'The Hark use case the link promotes, from Product’s list. Broad brand links can leave it out.',
    example: 'food_ordering',
  }),
  utm_content: def({
    key: 'utm_content',
    label: 'Content',
    kind: 'slug',
    max: 256,
    when: 'Optional',
    help: 'Readable label: ad or creative variant, creator handle, post or deliverable, email flow.',
    example: 'food_demo_v1',
  }),
  hark_creator_id: def({
    key: 'hark_creator_id',
    label: 'Creator ID',
    kind: 'hark_id',
    prefix: 'CT',
    max: 32,
    when: 'Creator activity',
    help: 'The creator’s Hark key (CT + 4 digits). The Creators tab keeps one per creator.',
    example: 'CT0042',
  }),
  hark_creative_id: def({
    key: 'hark_creative_id',
    label: 'Hark creative ID',
    kind: 'hark_id',
    prefix: 'CR',
    max: 32,
    when: 'When supplied by Media',
    help: 'Shared creative key. Not the ad platform’s creative ID.',
    example: 'CR0001',
  }),
  hark_landing_page_id: def({
    key: 'hark_landing_page_id',
    label: 'Landing page ID',
    kind: 'hark_id',
    prefix: 'LP',
    max: 32,
    when: 'When supplied by Media',
    help: 'Landing-page variant key.',
    example: 'LP0001',
  }),
  hark_experiment_id: def({
    key: 'hark_experiment_id',
    label: 'Experiment ID',
    kind: 'hark_id',
    prefix: 'EX',
    max: 32,
    when: 'When testing',
    help: 'Experiment key, if an experiment exists.',
    example: 'EX0001',
  }),
  hark_referral_code: def({
    key: 'hark_referral_code',
    label: 'Referral code',
    kind: 'code',
    max: 64,
    when: 'Referral links',
    help: 'Hark-issued code, exact case.',
    example: 'ZACH2026',
  }),
  hark_ad_campaign_id: def({
    key: 'hark_ad_campaign_id',
    label: 'Platform campaign ID',
    kind: 'platform_id',
    max: 128,
    when: 'Paid links, where supported',
    help: 'The platform’s campaign ID, via its macro.',
    example: '{{campaign.id}}',
  }),
  hark_ad_group_id: def({
    key: 'hark_ad_group_id',
    label: 'Platform ad group ID',
    kind: 'platform_id',
    max: 128,
    when: 'Paid links, where supported',
    help: 'The platform’s ad set / ad group ID, via its macro.',
    example: '{{adset.id}}',
  }),
  hark_ad_id: def({
    key: 'hark_ad_id',
    label: 'Platform ad ID',
    kind: 'platform_id',
    max: 128,
    when: 'Paid links, where supported',
    help: 'The platform’s ad ID. Never a creative ID.',
    example: '{{ad.id}}',
  }),
  hark_ad_creative_id: def({
    key: 'hark_ad_creative_id',
    label: 'Platform creative ID',
    kind: 'platform_id',
    max: 128,
    when: 'Where creative is the supported detail',
    help: 'The platform’s creative ID (TikTok __CID__, LinkedIn CREATIVE_ID).',
    example: '__CID__',
  }),
  hark_asset_group_id: def({
    key: 'hark_asset_group_id',
    label: 'Asset group ID',
    kind: 'platform_id',
    max: 128,
    when: 'Google Performance Max',
    help: 'Performance Max asset group, via {assetgroupid}.',
    example: '{assetgroupid}',
  }),
  utm_term: def({
    key: 'utm_term',
    label: 'Term',
    kind: 'term',
    max: 256,
    when: 'Search only',
    help: 'The platform keyword via {keyword}. Never raw search text.',
    example: '{keyword}',
  }),
  hark_ad_site: def({
    key: 'hark_ad_site',
    label: 'Site / placement',
    kind: 'platform_id',
    max: 32,
    when: 'When available',
    help: 'Meta {{site_source_name}}, Google {network}, TikTok __PLACEMENT__.',
    example: '{{site_source_name}}',
  }),
  utm_id: def({
    key: 'utm_id',
    label: 'GA4 campaign ID',
    kind: 'platform_id',
    max: 128,
    when: 'Optional, for GA4 campaign-ID reporting',
    help: 'The platform campaign ID macro. Remove it if GA4 campaign-ID reporting is out of scope.',
    example: '{{campaign.id}}',
  }),
};

/** Campaign names follow {market}_{objective}_{theme}_{yyyymm}. */
export const CAMPAIGN = {
  markets: ['us', 'global', 'gb', 'ca', 'au'],
  objectives: ['awareness', 'signup', 'app_install', 'activation', 'reengage'],
  pattern: /^(global|[a-z]{2})_(awareness|signup|app_install|activation|reengage)_[a-z0-9_]+_\d{6}$/,
};
