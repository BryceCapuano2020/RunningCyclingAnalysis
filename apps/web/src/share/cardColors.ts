/**
 * The share card is drawn on paper. Canvas cannot read custom properties, so each colour copies the
 * value of the token named in CARD_TOKEN, from apps/web/src/styles/tokens.css. cardColors.test.ts
 * keeps every value equal to its token. The meter's band is the leading sport's solid colour drawn at
 * BAND_OPACITY (cardMeter.ts), so it has no colour of its own.
 */
export const CARD_COLORS = {
  ink: '#fbfaf8',
  surface: '#f3f1ed',
  rule: '#eae7e1',
  text: '#0a0a0a',
  secondary: '#6b6660',
  muted: '#6b6660',
  brand: '#0a0a0a',
  run: '#c2410c',
  ride: '#1d4ed8',
  neutralMark: '#6b6660',
} as const

export type CardColor = keyof typeof CARD_COLORS

/** The token each card colour copies. */
export const CARD_TOKEN: Record<CardColor, string> = {
  ink: 'paper',
  surface: 'paper-hover',
  rule: 'hairline',
  text: 'ink',
  secondary: 'ink-secondary',
  muted: 'ink-secondary',
  brand: 'ink',
  run: 'run-ink',
  ride: 'ride-ink',
  neutralMark: 'ink-secondary',
}
