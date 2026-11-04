import { AnalysisSession } from '@rca/core/session'
import { gapOfHeadline } from '../src/ui/balanceGap.ts'
import { thresholdGrades } from '../src/ui/thresholdGrade.ts'
import type { LandingFigures } from '../src/ui/landingFigures.ts'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../src/ui/sampleAthlete.ts'

/** What every guard below asks for, since the sample and the landing example describe each other. */
const FIX = 'change the sample or the landing example'

/**
 * The least lead, in points of grade, the sample's example may show. The landing page states a lean ("balance leaning 12 points toward
 * running") and Balance decides a lean by the centre alone (`leanOfLead`): a centre within LEVEL_BAND (2) points of level reads even,
 * and the range, written beside the centre, does not decide it, so an athlete's range may cross zero and the sample's may too. The
 * example therefore needs a centre that leans clearly, not a range that stays off zero. Five is a little over two level bands, which
 * keeps the example's headline off the edge of "even" when the sample's grades move by a point across a New Year (sampleSections.test.ts).
 */
export const LANDING_MIN_LEAD_POINTS = 5

/**
 * The figures the landing page shows, read from the sample athlete's own analysis on the fixed reference clock.
 * It throws when the sample stops showing what the landing example describes (both sports graded, a lean of at
 * least LANDING_MIN_LEAD_POINTS, a run that is slipping), so the page never describes a sample that has moved.
 */
export function computeLandingFigures(): LandingFigures {
  const { result, fitness } = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
  if (result === null)
    throw new Error(`The sample has no result, so the landing page has no figures: ${FIX}.`)
  const headline = thresholdGrades(result, SAMPLE_PROFILE)
  const gap = gapOfHeadline(headline)
  if (headline.run.kind !== 'graded' || headline.ride.kind !== 'graded' || gap === null) {
    throw new Error(`The sample no longer grades both sports at their thresholds: ${FIX}.`)
  }
  // The example states a lean, and Balance decides a lean by the centre alone, so that is what the example needs to keep.
  if (gap.lean === 'even' || Math.abs(gap.centre) < LANDING_MIN_LEAD_POINTS) {
    throw new Error(
      `The sample no longer leans clearly, by at least ${LANDING_MIN_LEAD_POINTS} points, which the landing example says it does: ${FIX}.`,
    )
  }
  const run = fitness.run
  if (run.state !== 'slipping' || run.change === null || run.referenceHr === null) {
    throw new Error(
      `The sample's run shows "${run.state}", not the slip the landing example describes: ${FIX}.`,
    )
  }
  return {
    gap: { centre: gap.centre, low: gap.low, high: gap.high, lean: gap.lean },
    grades: { run: headline.run.grade, ride: headline.ride.grade },
    fitness: {
      referenceHr: run.referenceHr,
      change: run.change,
    },
  }
}
