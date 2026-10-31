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
export { lookBackOf, NO_LOOKBACK } from './compute'
export type { LookBack, SportLookBack } from './compute'
export { leadOf, mayStateHeld } from './lead'
export type { Lead, LiveState } from './lead'
export { milestonesOf } from './milestones'
export {
  bestRows,
  bestValue,
  breakRow,
  dayMonthYear,
  effortName,
  episodeRow,
  episodeSentence,
  leadSentence,
  monthYear,
  monthsBetween,
  quietRow,
  standing,
  thinRow,
  tooShortText,
} from './copy'
export type { EffortMilestones, MilestoneEffort, MilestoneUnit, Mark } from './types'
export { checkInBetween, beatsShown, OLDER_DAYS } from './checkIn'
export type { CheckIn, FitnessLine, NewBest, NewEpisode } from './checkIn'
export { checkInText } from './checkInCopy'
export type { CheckInText } from './checkInCopy'
export { beginImport, endImport, joins, JOIN_WINDOW_MS, usableBaseline } from './marks'
export type { BaselineCheck, ImportEnd, Marks } from './marks'
export { decodeSeconds, encodeSeconds, snapshotOf } from './snapshot'
export type {
  CheckInSnapshot,
  SnapshotBest,
  SnapshotEpisode,
  SnapshotFitness,
  SnapshotInputs,
} from './snapshot'
