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
  /** Suggestions for utm_usecase. Replace with Hark's own list as it settles. */
  useCases: ['inbox', 'calendar', 'research', 'shopping', 'travel', 'trackers', 'web_tasks'],
};
