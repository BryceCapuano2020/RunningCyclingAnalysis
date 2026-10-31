/**
 * The change test: whether the selected period's best efforts differ from the previous period's by more than
 * the athlete's own efforts would put them apart by chance. See docs/design/change-test.md.
 */
export { changeEvidence } from './evidence'
export { CHANGE } from './constants'
export {
  callAt,
  detectableAt,
  directionOf,
  MAX_STATED_RESOLUTION,
  statedResolutionAt,
  verdictAt,
  verdictOfCall,
} from './types'
export type { ChangeBasis, ChangeCall, ChangeEvidence, ChangeLevel, ChangeVerdict } from './types'
