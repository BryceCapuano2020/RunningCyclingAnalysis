/**
 * The change test: whether the selected period's best efforts differ from the previous period's by more than
 * the athlete's own efforts would put them apart by chance. See docs/design/change-test.md.
 */
export { changeCallBetween, changeEvidence } from './evidence'
export { readingsOf } from './readings'
export type { Readings } from './readings'
export { CHANGE } from './constants'
export { callAt, detectableAt, directionOf, verdictAt, verdictOfCall } from './types'
export type { ChangeBasis, ChangeCall, ChangeEvidence, ChangeLevel, ChangeVerdict } from './types'
