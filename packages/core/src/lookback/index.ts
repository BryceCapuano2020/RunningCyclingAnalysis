/**
 * The look-back: a sport's years of fitness at the same effort told in hindsight, through a horizon 12 weeks before the
 * newest activity (the weeks after it belong to the fitness card). A sport needs `LOOKBACK.minimum` of steady-run
 * history before the horizon. It cuts the steady-run series into plateaus and lists the quiet stretches and breaks,
 * and lists no episodes. Its best efforts over the years are `milestonesOf`. Every number is in `params.ts`.
 */
export { hindsightOf, horizonDay, shortOf } from './hindsight'
export type { HindsightInput } from './hindsight'
export { LOOKBACK } from './params'
export type { HindsightFitness, Plateau, QuietStretch, SportYears, Span, TooShort } from './types'
export { hindsightsOf, lookBackOf, NO_LOOKBACK } from './compute'
export type { LookBack, SportLookBack } from './compute'
export { mayStateHeld } from './lead'
export type { LiveState } from './lead'
export { milestonesOf } from './milestones'
export { bestValue, dayMonthYear, effortName, monthYear, monthsBetween, tooShortText } from './copy'
export type { EffortMilestones, MilestoneEffort, MilestoneUnit, Mark } from './types'
export { checkInBetween, beatsShown, OLDER_DAYS } from './checkIn'
export type { CheckIn, NewBest } from './checkIn'
export { yearsFinding } from './sectionCopy'
export { checkInText } from './checkInCopy'
export type { CheckInFigure, CheckInText } from './checkInCopy'
export { beginImport, endImport, joins, JOIN_WINDOW_MS, usableBaseline } from './marks'
export type { BaselineCheck, ImportEnd, Marks } from './marks'
export { decodeSeconds, encodeSeconds, snapshotOf } from './snapshot'
export type { CheckInSnapshot, SnapshotBest, SnapshotInputs } from './snapshot'
