/**
 * The look-back: a sport's years of fitness at the same effort told in hindsight, through a horizon 12 weeks before the
 * newest activity. See docs/design/lookback.md.
 */
export { hindsightOf, horizonDay, shortOf } from './hindsight'
export type { HindsightInput } from './hindsight'
export { meetsLeadBar } from './lead'
export { LOOKBACK } from './params'
export type {
  EpisodeKind,
  HindsightEpisode,
  HindsightFitness,
  Plateau,
  QuietStretch,
  SportYears,
  Span,
  TooShort,
} from './types'
