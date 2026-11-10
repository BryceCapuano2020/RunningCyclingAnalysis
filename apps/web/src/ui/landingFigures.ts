import type { Ranged } from '@rca/core/fitness'
import type { Sport } from '@rca/core/types'
import { declared, resolved } from '../styles/tokenSheet'
import type { SportGrade } from './grades'
import { SPORT_NOUN } from '../domain/sportNoun'

/**
 * The figures the landing page and its share image show. They are the sample athlete's own, read from the
 * sample's analysis when the app is built (scripts/landingFigures.ts) and reached as `virtual:landing-figures`,
 * so nothing here is typed by hand and the page cannot drift from the sample.
 */
export interface LandingFigures {
  gap: { centre: number; low: number; high: number; lean: Sport }
  grades: Record<Sport, SportGrade>
  /**
   * The run's fitness status as the example draws it: the heart rate it is read at and the change as a track. The
   * size of the change is not here: the sample's fitness model reads its weeks from a fixed origin, so its size moves
   * by a point as the visit day moves through a 12 week cycle, and a figure made at build time would sometimes differ
   * from the one the sample's own Balance page gives. The state and the heart rate hold on every day (sampleSections.test.ts).
   */
  fitness: { referenceHr: number; change: Ranged }
}

/** What the share image's description says of the figures: the two levels and which way the balance leans. */
export function ogAlt({ grades, gap }: LandingFigures): string {
  return `A sample athlete's result: running at ${grades.run.centre.level} level, cycling at ${grades.ride.centre.level}, balance leaning ${Math.abs(gap.centre)} points toward ${SPORT_NOUN[gap.lean]}.`
}

/** index.html with the placeholders it holds for text made from the figures filled in. */
export function fillLandingOg(html: string, figures: LandingFigures): string {
  return html.replaceAll('%LANDING_OG_ALT%', () => ogAlt(figures))
}

/** The colours the share image draws with, by the name the image uses for each. */
export type CardInk = Record<
  'paper' | 'hairline' | 'rule' | 'ink' | 'secondary' | 'run' | 'ride' | 'lift' | 'control',
  string
>

const INK_TOKENS: Record<keyof CardInk, string> = {
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

/** The card's colours from tokens.css: the paper tokens, with any var() followed. */
export function cardInk(tokensCss: string): CardInk {
  const tokens = resolved(declared(tokensCss, ':root'))
  const ink = {} as CardInk
  for (const [name, token] of Object.entries(INK_TOKENS) as [keyof CardInk, string][]) {
    const value = tokens.get(token)
    if (value === undefined) throw new Error(`tokens.css has no --${token} for the share image`)
    ink[name] = value
  }
  return ink
}

/**
 * A short hash of what the share image draws: the figures it shows and its colours. public/social-card.stamp
 * holds it for the PNG on disk, so a test can tell when the image is older than either.
 */
export function cardStamp({ gap, grades }: LandingFigures, ink: CardInk): string {
  const text = JSON.stringify({ gap, grades, ink })
  // cyrb53: a change detector, not a security hash, so it needs no Node import in the app's own tree.
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}
