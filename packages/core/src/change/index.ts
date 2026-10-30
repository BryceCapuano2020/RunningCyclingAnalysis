/**
 * The change test: whether the selected period's best efforts differ from the previous period's by more than
 * the athlete's own efforts would put them apart by chance. See docs/design/change-test.md.
 */
export { changeEvidence } from './evidence'
export { CHANGE } from './constants'
export { callAt, verdictAt } from './types'
export type { ChangeCall, ChangeEvidence, ChangeVerdict } from './types'
