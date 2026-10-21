import { describe, expect, it } from 'vitest';
import { channelOf } from '../config/channels';
import { buildLink, isCurrentFormat, joinUrl, normalizeParam, parseDestination, slugify, splitTaggedUrl } from './utm';

describe('schema value rules', () => {
  it('normalizes campaign names exactly as the schema describes', () => {
    expect(slugify('US-Signup Food.202610')).toBe('us_signup_food_202610');
    expect(slugify('  us--signup__food  ')).toBe('us_signup_food');
    expect(slugify('Mia & Lexie')).toBe('mia_and_lexie');
    expect(slugify('Café Launch!')).toBe('cafe_launch');
  });

  it('turns handles into a-z, 0-9 and underscore', () => {
    expect(normalizeParam('utm_content', '@khani.trendy')).toBe('khani_trendy');
    expect(normalizeParam('utm_content', 'lillian__chiu')).toBe('lillian_chiu');
    expect(normalizeParam('utm_content', 'abhijayarora_')).toBe('abhijayarora');
    expect(normalizeParam('utm_content', 'ux_deniza')).toBe('ux_deniza');
  });

  it('maps source aliases to one canonical name', () => {
    expect(normalizeParam('utm_source', 'IG')).toBe('instagram');
    expect(normalizeParam('utm_source', 'Tik Tok')).toBe('tiktok');
    expect(normalizeParam('utm_source', 'Twitter')).toBe('x');
    expect(normalizeParam('utm_content', 'IG')).toBe('ig');
  });

  it('pads Hark keys and keeps platform IDs exactly', () => {
    expect(normalizeParam('hark_creative_id', 'cr42')).toBe('CR0042');
    expect(normalizeParam('hark_landing_page_id', 'LP 12345')).toBe('LP12345');
    expect(normalizeParam('hark_ad_id', '000123')).toBe('000123');
    expect(normalizeParam('hark_ad_campaign_id', '123456789012345678')).toBe('123456789012345678');
    expect(normalizeParam('hark_referral_code', ' ZachX2026 ')).toBe('ZachX2026');
  });

  it('keeps the separator next to a macro', () => {
    expect(normalizeParam('utm_content', 'Prospecting_{{adset.id}}')).toBe('prospecting_{{adset.id}}');
    expect(normalizeParam('utm_content', '__CID__')).toBe('__CID__');
    expect(normalizeParam('utm_content', ' Spark __CID__ ')).toBe('spark___CID__');
  });

  it('keeps macros and lowercases search terms', () => {
    expect(normalizeParam('hark_ad_site', '{{site_source_name}}')).toBe('{{site_source_name}}');
    expect(normalizeParam('hark_ad_site', 'Audience Network')).toBe('audience_network');
    expect(normalizeParam('utm_term', 'Food  Delivery Assistant')).toBe('food delivery assistant');
    expect(normalizeParam('utm_term', '{keyword}')).toBe('{keyword}');
  });
});

describe('destinations', () => {
  it('adds https and strips existing tracking params', () => {
    const d = parseDestination('hark.com/pro?ref=abc&utm_source=old&hark_use_case=x');
    expect(d.base).toBe('https://hark.com/pro?ref=abc');
    expect(d.warnings[0]).toMatch(/utm_source, hark_use_case/);
  });

  it('rejects junk and warns on store links and the example.com placeholder', () => {
    expect(parseDestination('not a url').error).toBeTruthy();
    expect(parseDestination('').error).toBeTruthy();
    expect(parseDestination('https://apps.apple.com/app/id123').warnings.join()).toMatch(/App store/);
    expect(parseDestination('https://example.com/').warnings.join()).toMatch(/placeholder/);
  });

  it('keeps query and fragment in the right places', () => {
    expect(joinUrl('https://hark.com/', 'utm_source=x')).toBe('https://hark.com/?utm_source=x');
    expect(joinUrl('https://hark.com/?a=1', 'utm_source=x')).toBe('https://hark.com/?a=1&utm_source=x');
    expect(joinUrl('https://hark.com/p#top', 'utm_source=x')).toBe('https://hark.com/p?utm_source=x#top');
  });
});

/** The schema's own "Link Examples" sheet, reproduced by the builder. */
describe('schema link examples', () => {
  const food = { utm_campaign: 'us_signup_food_202610', hark_use_case: 'food_ordering' };
  const build = (channel: string, extra: Record<string, string>) =>
    buildLink(channel, 'https://example.com/', { ...channelDefaults(channel), ...food, ...extra }).url;

  it('Meta', () => {
    expect(build('meta_ads', { utm_content: 'food_demo_v1' })).toBe(
      'https://example.com/?utm_source=meta&utm_medium=paid_social&utm_campaign=us_signup_food_202610&hark_use_case=food_ordering&utm_content=food_demo_v1&hark_ad_campaign_id={{campaign.id}}&hark_ad_group_id={{adset.id}}&hark_ad_id={{ad.id}}&hark_ad_site={{site_source_name}}&utm_id={{campaign.id}}',
    );
  });

  it('Google Search', () => {
    expect(build('google_search', {})).toBe(
      'https://example.com/?utm_source=google&utm_medium=paid_search&utm_campaign=us_signup_food_202610&hark_use_case=food_ordering&hark_ad_campaign_id={campaignid}&hark_ad_group_id={adgroupid}&hark_ad_id={creative}&utm_term={keyword}&hark_ad_site={network}&utm_id={campaignid}',
    );
  });

  it('Google mixed inventory (PMax)', () => {
    expect(build('google_pmax', {})).toBe(
      'https://example.com/?utm_source=google&utm_medium=cross_network&utm_campaign=us_signup_food_202610&hark_use_case=food_ordering&hark_ad_campaign_id={campaignid}&hark_asset_group_id={assetgroupid}&hark_ad_site={network}&utm_id={campaignid}',
    );
  });

  it('YouTube', () => {
    expect(build('youtube_ads', {})).toBe(
      'https://example.com/?utm_source=google&utm_medium=paid_video&utm_campaign=us_signup_food_202610&hark_use_case=food_ordering&hark_ad_campaign_id={campaignid}&hark_ad_group_id={adgroupid}&hark_ad_id={creative}&utm_id={campaignid}',
    );
  });

  it('TikTok', () => {
    expect(build('tiktok_ads', {})).toBe(
      'https://example.com/?utm_source=tiktok&utm_medium=paid_social&utm_campaign=us_signup_food_202610&hark_use_case=food_ordering&hark_ad_campaign_id=__CAMPAIGN_ID__&hark_ad_group_id=__AID__&hark_ad_creative_id=__CID__&hark_ad_site=__PLACEMENT__&utm_id=__CAMPAIGN_ID__',
    );
  });

  it('LinkedIn', () => {
    expect(build('linkedin_ads', {})).toBe(
      'https://example.com/?utm_source=linkedin&utm_medium=paid_social&utm_campaign=us_signup_food_202610&hark_use_case=food_ordering&hark_ad_campaign_id={{CAMPAIGN_GROUP_ID}}&hark_ad_group_id={{CAMPAIGN_ID}}&hark_ad_creative_id={{CREATIVE_ID}}&utm_id={{CAMPAIGN_ID}}',
    );
  });

  it('Paid creator amplification, with the creator in Content instead of hark_creator_id', () => {
    expect(build('meta_ads', { utm_content: 'livviazhang_food_demo_v1' })).toBe(
      'https://example.com/?utm_source=meta&utm_medium=paid_social&utm_campaign=us_signup_food_202610&hark_use_case=food_ordering&utm_content=livviazhang_food_demo_v1&hark_ad_campaign_id={{campaign.id}}&hark_ad_group_id={{adset.id}}&hark_ad_id={{ad.id}}&hark_ad_site={{site_source_name}}&utm_id={{campaign.id}}',
    );
  });
});

/** Creator links: the schema's platform / creator pair, with the handle in utm_content identifying the creator. */
describe('creator links', () => {
  const creator = (extra: Record<string, string>) =>
    buildLink('creator', 'https://hark.com/', { ...channelDefaults('creator'), utm_campaign: 'us_signup_creators_202610', ...extra });

  it('platform / creator with the handle in Content', () => {
    const link = creator({ utm_source: 'TT', utm_content: '@livviazhang' });
    expect(link.ok).toBe(true);
    expect(link.issues).toEqual([]);
    expect(link.url).toBe(
      'https://hark.com/?utm_source=tiktok&utm_medium=creator&utm_campaign=us_signup_creators_202610&utm_content=livviazhang',
    );
  });

  it('flags a non-creator platform and a link tool as the source', () => {
    expect(creator({ utm_source: 'linktree', utm_content: 'itsnazsare' }).issues.map((i) => i.message).join()).toMatch(/instagram, tiktok, youtube/);
  });

  it('builds the proposed influencer and lifecycle rows, with a warning that Hark will flag them', () => {
    for (const [channel, extra] of [
      ['influencer_linkinbio', { utm_source: 'instagram', utm_content: 'itsnazsare' }],
      ['paid_influencer', { utm_source: 'instagram', utm_content: 'itsnazsare_food_demo_reel_v1' }],
      ['lifecycle', { utm_content: 'reactivation_day30_v1' }],
    ] as const) {
      const link = buildLink(channel, 'https://hark.com/', { ...channelDefaults(channel), utm_campaign: 'us_signup_food_202610', ...extra });
      expect(link.ok).toBe(true);
      expect(link.issues.map((i) => i.message).join()).toMatch(/isn’t in the Hark schema yet/);
    }
  });
});

describe('checks', () => {
  it('flags a missing handle, off-schema sources and campaign names', () => {
    const link = buildLink('creator', 'https://hark.com', { utm_source: 'linktree', utm_medium: 'creator', utm_campaign: 'creators' });
    const messages = link.issues.map((i) => i.message).join(' | ');
    expect(link.ok).toBe(false);
    expect(messages).toMatch(/Content is required/);
    expect(messages).toMatch(/instagram, tiktok, youtube/);
    expect(messages).toMatch(/\{market\}_\{objective\}/);
  });

  it('checks Hark keys against their prefix', () => {
    const bad = buildLink('meta_ads', 'https://hark.com', { utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: 'us_signup_food_202610', hark_creative_id: 'demo' });
    expect(bad.issues.map((i) => i.message).join()).toMatch(/CR0001/);
  });

  it('warns when Term is used outside search, and treats the Oct 16 creator format as off schema', () => {
    const params = { utm_source: 'tiktok', utm_medium: 'creator', utm_campaign: 'creator_always_on', utm_content: 'livviazhang', utm_term: 'link_in_bio' };
    const built = buildLink('creator', 'https://hark.com/', params);
    expect(built.issues.map((i) => i.message).join()).toMatch(/paid search keywords only/);
    expect(isCurrentFormat({ channel: 'creator', baseUrl: 'https://hark.com/', params, url: built.url })).toBe(false);
    expect(buildLink('google_search', 'https://hark.com/', { utm_source: 'google', utm_medium: 'paid_search', utm_campaign: 'us_signup_food_202610', utm_term: '{keyword}' }).issues).toEqual([]);
  });

  it('treats a link that still carries hark_creator_id as old format', () => {
    const params = { utm_source: 'instagram', utm_medium: 'creator', utm_campaign: 'us_signup_creators_202610', utm_content: 'josh_jogs' };
    const url = buildLink('creator', 'https://hark.com/', params).url;
    expect(isCurrentFormat({ channel: 'creator', baseUrl: 'https://hark.com/', params, url })).toBe(true);
    const withId = { ...params, hark_creator_id: 'CT0008' } as typeof params;
    expect(isCurrentFormat({ channel: 'creator', baseUrl: 'https://hark.com/', params: withId, url: `${url}&hark_creator_id=CT0008` })).toBe(false);
  });

  it('rejects REPLACE_ placeholders and leftover [column] tokens', () => {
    const link = buildLink('reddit_ads', 'https://hark.com', {
      utm_source: 'reddit',
      utm_medium: 'paid_social',
      utm_campaign: 'us_signup_food_202610',
      hark_ad_campaign_id: '{REPLACE_CAMPAIGN_ID}',
      utm_content: '[handle]',
    });
    expect(link.ok).toBe(false);
    expect(link.issues.map((i) => i.message).join()).toMatch(/REPLACE_.*|placeholder/);
  });

  it('URL-encodes literal IDs and terms but not macros', () => {
    const link = buildLink('google_search', 'https://hark.com', {
      utm_source: 'google',
      utm_medium: 'paid_search',
      utm_campaign: 'us_signup_food_202610',
      utm_term: 'food delivery assistant',
      hark_ad_id: 'A&B',
    });
    expect(link.query).toBe(
      'utm_source=google&utm_medium=paid_search&utm_campaign=us_signup_food_202610&hark_ad_id=A%26B&utm_term=food%20delivery%20assistant',
    );
  });

  it('round-trips through splitTaggedUrl', () => {
    const link = buildLink('newsletter', 'https://hark.com/pro?ref=nl', { utm_source: 'hark_newsletter', utm_medium: 'email', utm_campaign: 'us_activation_oct_202610' });
    const back = splitTaggedUrl(link.url);
    expect(back.base).toBe('https://hark.com/pro?ref=nl');
    expect(back.params).toEqual({ utm_source: 'hark_newsletter', utm_medium: 'email', utm_campaign: 'us_activation_oct_202610' });
  });
});

function channelDefaults(id: string) {
  return { ...channelOf(id).defaults } as Record<string, string>;
}
