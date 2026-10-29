import type { ActivityTrace } from './types'

/** Whether second i was timed: neither paused nor in a record gap the device did not time. */
export function isMovingSecond(
  trace: Pick<ActivityTrace, 'paused' | 'unrecorded'>,
  i: number,
): boolean {
  return trace.paused[i] !== 1 && trace.unrecorded[i] !== 1
}
