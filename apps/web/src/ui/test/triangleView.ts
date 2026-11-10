import type { Grade, SportGrade } from '@rca/core/grade'
import type { Lead } from '@rca/core/standing'
import { NO_TRIANGLE_GRADES } from '@rca/core/standing'
import type { TriangleView } from '../triangleSports'

/** A grade at a whole percent, with the half percent's margin so floating point never floors it down a point. */
const at = (percent: number): Grade => ({ grade: (percent + 0.04) / 100, level: 'x' })

/** The ride's grade in the views below, in whole percent, held as a point. */
const RIDE_PERCENT = 50

/**
 * A level triangle whose run and ride grades give exactly this lead (centre and 90% range, in whole points) by `balanceLead`: the
 * ride is a point at 50% and the run carries the range. Lifting has no grade, as on the page today. For tests that state a gap.
 */
export function viewOfGap(lead: Pick<Lead, 'centre' | 'low' | 'high'>): TriangleView {
  const centre = RIDE_PERCENT + lead.centre
  const run: SportGrade = {
    centre: at(centre),
    range: {
      low: at(centre - (lead.centre - lead.low)),
      high: at(centre + (lead.high - lead.centre)),
    },
  }
  const ride: SportGrade = { centre: at(RIDE_PERCENT), range: null }
  return {
    grades: {
      ...NO_TRIANGLE_GRADES,
      run: { kind: 'graded', grade: run },
      ride: { kind: 'graded', grade: ride },
    },
    notes: {},
  }
}
