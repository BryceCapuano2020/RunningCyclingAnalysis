/**
 * The share card is always dark. Canvas cannot read custom properties, so each colour copies the
 * dark-theme value of the token named in CARD_TOKEN, from apps/web/src/styles/tokens.css.
 * cardColors.test.ts keeps every value equal to its token. The meter's band is the leading sport's
 * solid colour drawn at BAND_OPACITY (cardMeter.ts), so it has no colour of its own.
 */
export const CARD_COLORS = {
  ink: '#0e1116',
  surface: '#1e232c',
  rule: '#2a2f38',
  text: '#eef0f3',
  secondary: '#b6bcc6',
  muted: '#8d95a2',
  brand: '#c8f03c',
  run: '#f56333',
  ride: '#4d6ef5',
  neutralMark: '#b6bcc6',
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
  brand: 'brand',
  run: 'series-run',
  ride: 'series-ride',
  neutralMark: 'neutral-mark',
}
