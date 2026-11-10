/**
 * The share card is drawn on paper, in ink, as the app is. Canvas cannot read custom properties, so each colour
 * copies the value of the token named in CARD_TOKEN, from apps/web/src/styles/tokens.css. cardColors.test.ts keeps
 * every value equal to its token. A sport's ink appears only as its name on the triangle's corner, its dot and a
 * threshold's label; figures and sentences are ink.
 */
export const CARD_COLORS = {
  paper: '#fbfaf8',
  hairline: '#eae7e1',
  rule: '#dcd8d1',
  ink: '#0a0a0a',
  secondary: '#6b6660',
  run: '#c2410c',
  ride: '#1d4ed8',
  lift: '#86198f',
  control: '#8a847c',
} as const

export type CardColor = keyof typeof CARD_COLORS

/** The token each card colour copies. */
export const CARD_TOKEN: Record<CardColor, string> = {
  paper: 'paper',
  hairline: 'hairline',
  rule: 'rule',
  ink: 'ink',
  secondary: 'ink-secondary',
  run: 'run-ink',
  ride: 'ride-ink',
  lift: 'lift-ink',
  control: 'control-border',
}
