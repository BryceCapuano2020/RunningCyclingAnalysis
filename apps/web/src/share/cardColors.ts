/**
 * The share card is always dark. Canvas cannot read custom properties, so each colour copies the
 * dark-theme value of the token named in CARD_TOKEN, from apps/web/src/styles/tokens.css.
 * cardColors.test.ts keeps every value equal to its token.
 */
export const CARD_COLORS = {
  ink: '#0e1116',
  surface: '#1e232c',
  rule: '#2a2f38',
  text: '#eef0f3',
  secondary: '#b6bcc6',
  muted: '#8d95a2',
  run: '#f0435f',
  ride: '#4d6ef5',
  runSoft: '#f0435f33',
  rideSoft: '#4d6ef533',
  neutralMark: '#b6bcc6',
  neutralBand: '#b6bcc629',
  warning: '#f2b544',
  warningBg: '#33290c',
} as const

export type CardColor = keyof typeof CARD_COLORS

/** The token each card colour copies. */
export const CARD_TOKEN: Record<CardColor, string> = {
  ink: 'accent-contrast',
  surface: 'surface-2',
  rule: 'border',
  text: 'text-primary',
  secondary: 'text-secondary',
  muted: 'text-muted',
  run: 'series-run',
  ride: 'series-ride',
  runSoft: 'series-run-soft',
  rideSoft: 'series-ride-soft',
  neutralMark: 'neutral-mark',
  neutralBand: 'neutral-band',
  warning: 'status-warning',
  warningBg: 'status-warning-bg',
}
