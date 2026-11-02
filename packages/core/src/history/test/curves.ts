import { historyOf } from '../compute'
import type { ActivityDigest } from '../../types'
import type { HistoryInput } from '../types'
import { INPUT } from './digests'

/** The best curve of each year of a library. */
export const yearCurvesOf = (digests: ActivityDigest[], input: HistoryInput = INPUT) =>
  historyOf(digests, input).yearCurves
