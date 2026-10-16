import { describe, expect, it } from 'vitest';
import { buildLink, joinUrl, normalizeParam, normalizeValue, parseDestination, splitTaggedUrl } from './utm';

describe('normalizeValue', () => {
  it('lowercases and underscores', () => {
    expect(normalizeValue('  Back to School Q4 ')).toBe('back_to_school_q4');
    expect(normalizeValue('Mia & Lexie')).toBe('mia_and_lexie');
    expect(normalizeValue('@ItsNazsare')).toBe('itsnazsare');
    expect(normalizeValue('Café Launch!')).toBe('cafe_launch');
    expect(normalizeValue('Q4 - Promo')).toBe('q4-promo');
  });

  it('keeps handles with dots and double underscores intact', () => {
    expect(normalizeValue('lillian__chiu')).toBe('lillian__chiu');
    expect(normalizeValue('smart.nonsense')).toBe('smart.nonsense');
    expect(normalizeValue('abhijayarora_')).toBe('abhijayarora');
  });

  it('leaves platform macros untouched', () => {
    expect(normalizeValue('{{campaign.name}}')).toBe('{{campaign.name}}');
    expect(normalizeValue('{{adSet.name}}')).toBe('{{adSet.name}}');
    expect(normalizeValue('__CID_NAME__')).toBe('__CID_NAME__');
    expect(normalizeValue('{keyword}')).toBe('{keyword}');
    expect(normalizeValue('{CampaignId}')).toBe('{CampaignId}');
    expect(normalizeValue('Prospecting_{{adset.id}}')).toBe('prospecting_{{adset.id}}');
  });

  it('maps source aliases to one canonical name', () => {
    expect(normalizeParam('utm_source', 'IG')).toBe('instagram');
    expect(normalizeParam('utm_source', 'Tik Tok')).toBe('tiktok');
    expect(normalizeParam('utm_source', 'TT')).toBe('tiktok');
    expect(normalizeParam('utm_source', 'Twitter')).toBe('x');
    expect(normalizeParam('utm_content', 'IG')).toBe('ig');
  });
});

describe('destinations', () => {
  it('adds https and strips existing UTMs', () => {
    const d = parseDestination('hark.com/pro?ref=abc&utm_source=old');
    expect(d.base).toBe('https://hark.com/pro?ref=abc');
    expect(d.warnings[0]).toMatch(/utm_source/);
  });

  it('rejects junk and warns on app store links', () => {
    expect(parseDestination('not a url').error).toBeTruthy();
    expect(parseDestination('').error).toBeTruthy();
    expect(parseDestination('https://apps.apple.com/app/id123').warnings.join()).toMatch(/App store/);
  });

  it('keeps query and fragment in the right places', () => {
    expect(joinUrl('https://hark.com/', 'utm_source=x')).toBe('https://hark.com/?utm_source=x');
    expect(joinUrl('https://hark.com/?a=1', 'utm_source=x')).toBe('https://hark.com/?a=1&utm_source=x');
    expect(joinUrl('https://hark.com/p#top', 'utm_source=x')).toBe('https://hark.com/p?utm_source=x#top');
  });
});

describe('buildLink', () => {
  it('builds a creator link in fixed parameter order', () => {
    const link = buildLink('creator', 'https://hark.com', {
      utm_term: 'Link in bio',
      utm_content: '@livviazhang',
      utm_campaign: 'creator_always_on',
      utm_medium: 'creator',
      utm_source: 'TT',
    });
    expect(link.ok).toBe(true);
    expect(link.url).toBe(
      'https://hark.com/?utm_source=tiktok&utm_medium=creator&utm_campaign=creator_always_on&utm_content=livviazhang&utm_term=link_in_bio',
    );
  });

  it('builds a Meta parameter string with macros', () => {
    const link = buildLink('meta_ads', 'https://hark.com/', {
      utm_source: 'facebook',
      utm_medium: 'paid_social',
      utm_campaign: '{{campaign.name}}',
      utm_adgroup: '{{adset.name}}',
      utm_ad: '{{ad.name}}',
      utm_content: '{{ad.id}}',
      utm_usecase: 'Inbox',
    });
    expect(link.query).toBe(
      'utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.id}}&utm_adgroup={{adset.name}}&utm_ad={{ad.name}}&utm_usecase=inbox',
    );
  });

  it('flags missing required fields, off-convention mediums and leftover placeholders', () => {
    const link = buildLink('creator', 'https://hark.com', { utm_source: 'tiktok', utm_medium: 'social', utm_content: '[handle]' });
    expect(link.ok).toBe(false);
    const messages = link.issues.map((i) => i.message).join(' | ');
    expect(messages).toMatch(/Campaign is required/);
    expect(messages).toMatch(/normally use medium “creator”/);
    expect(messages).toMatch(/placeholder/);
  });

  it('round-trips through splitTaggedUrl', () => {
    const link = buildLink('email', 'https://hark.com/pro?ref=nl', { utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'oct' });
    const back = splitTaggedUrl(link.url);
    expect(back.base).toBe('https://hark.com/pro?ref=nl');
    expect(back.params).toEqual({ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'oct' });
  });
});
