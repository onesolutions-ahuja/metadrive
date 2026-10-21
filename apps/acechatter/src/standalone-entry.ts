/** AceChatter owns presentation only. MetaDrive owns login, tenancy, RBAC and Flows. */
export const ACECHATTER_STANDALONE_ENTRY = Object.freeze({
  appId: 'AceChatter',
  slug: 'acechatter',
  label: 'AceChatter',
  tagline: 'Customer conversations in one place.',
  eyebrow: 'ACECHATTER INBOX',
  accent: '#128C7E',
  signInDescription: 'Use your UNE Solutions account to access authorised conversations.'
} as const);
