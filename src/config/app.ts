/** Display copy and team-level settings. Change here rather than in components. */
export const APP = {
  client: 'Hark',
  title: 'UTM Builder',
  preparedBy: 'Darkroom',
  /** Offered in every destination field. The first one is the default for new links. */
  destinations: [{ label: 'Hark homepage', url: 'https://hark.com/' }],
  /** Who builds links. Stored on every saved link so the library shows who made what. */
  teams: [
    'Paid Social',
    'Paid Search',
    'Creator',
    'Organic Social',
    'Lifecycle',
    'Partnerships',
    'Brand & PR',
    'Growth',
    'Other',
  ],
  /** Suggestions for hark_use_case. Product owns this list; these are the schema's examples. */
  useCases: ['food_ordering', 'travel_planning', 'scheduling'],
  /**
   * Starting campaign name for creator batches: {market}_{objective}_{theme}_{yyyymm}.
   * Confirm with Media; once links go live the name must not change.
   */
  creatorCampaign: (yyyymm: string) => `us_signup_creators_${yyyymm}`,
};

/** "202610" for October 2026. */
export const currentYyyymm = (d = new Date()): string => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
