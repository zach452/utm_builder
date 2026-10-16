/**
 * The UTM parameters every link can carry, in the order they appear in the URL.
 * The order is fixed so the same inputs always produce the same URL, which is how
 * duplicates are detected. To add a parameter, add it here; every view picks it up.
 */
export const PARAM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_adgroup',
  'utm_ad',
  'utm_creative',
  'utm_usecase',
] as const;

export type ParamKey = (typeof PARAM_KEYS)[number];
export type Params = Partial<Record<ParamKey, string>>;

export interface ParamDef {
  key: ParamKey;
  label: string;
  /** Required on every link, whatever the channel. */
  required: boolean;
  help: string;
  example: string;
}

export const PARAMS: Record<ParamKey, ParamDef> = {
  utm_source: {
    key: 'utm_source',
    label: 'Source',
    required: true,
    help: 'Where the click comes from: the platform, publisher or list.',
    example: 'tiktok',
  },
  utm_medium: {
    key: 'utm_medium',
    label: 'Medium',
    required: true,
    help: 'The type of traffic. Comes from the channel, so reports group cleanly.',
    example: 'paid_social',
  },
  utm_campaign: {
    key: 'utm_campaign',
    label: 'Campaign',
    required: true,
    help: 'The initiative or ad-platform campaign the link belongs to.',
    example: 'hark_pro_launch',
  },
  utm_content: {
    key: 'utm_content',
    label: 'Content',
    required: false,
    help: 'What tells links in the same campaign apart: creator handle, ad ID, email link position.',
    example: 'itsnazsare',
  },
  utm_term: {
    key: 'utm_term',
    label: 'Term',
    required: false,
    help: 'Paid search keyword. For creators, where the link sits (link_in_bio, description).',
    example: 'ai_assistant',
  },
  utm_adgroup: {
    key: 'utm_adgroup',
    label: 'Ad group',
    required: false,
    help: 'Ad set / ad group name. Use the platform macro so it fills itself in.',
    example: 'broad_us_25_44',
  },
  utm_ad: {
    key: 'utm_ad',
    label: 'Ad',
    required: false,
    help: 'Ad name. Use the platform macro so it fills itself in.',
    example: 'ugc_meetings_v3',
  },
  utm_creative: {
    key: 'utm_creative',
    label: 'Creative',
    required: false,
    help: 'Optional. Creative concept or format, e.g. ugc_testimonial, static, creator_whitelist.',
    example: 'ugc_testimonial',
  },
  utm_usecase: {
    key: 'utm_usecase',
    label: 'Use case',
    required: false,
    help: 'Optional. The Hark use case the link promotes.',
    example: 'inbox',
  },
};
