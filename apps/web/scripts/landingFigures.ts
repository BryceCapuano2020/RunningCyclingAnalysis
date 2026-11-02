import { fitnessLines } from '@rca/core/fitness'
import { AnalysisSession } from '@rca/core/session'
import { gapOfHeadline } from '../src/ui/balanceGap.ts'
import { headlineGrades } from '../src/ui/grades.ts'
import type { LandingFigures } from '../src/ui/landingFigures.ts'
import { SAMPLE_PROFILE, SAMPLE_SETTINGS } from '../src/ui/sampleAthlete.ts'

/** What every guard below asks for, since the sample and the landing example describe each other. */
const FIX = 'change the sample or the landing example'

/**
 * The figures the landing page shows, read from the sample athlete's own analysis on the fixed reference clock.
 * It throws when the sample stops showing what the landing example describes (both sports graded, a lean clear
 * of zero, a run that is slipping), so the page never describes a sample that has moved.
 */
export function computeLandingFigures(): LandingFigures {
  const { result, fitness } = new AnalysisSession().loadSample(SAMPLE_SETTINGS)
  if (result === null)
    throw new Error(`The sample has no result, so the landing page has no figures: ${FIX}.`)
  const headline = headlineGrades(result, SAMPLE_PROFILE)
  const gap = gapOfHeadline(headline)
  if (headline.run.kind !== 'graded' || headline.ride.kind !== 'graded' || gap === null) {
    throw new Error(`The sample no longer grades both sports at the headline duration: ${FIX}.`)
  }
  // The headline and the card say which sport leads, so the lead's range must keep clear of zero.
  if (gap.lean === 'even' || (gap.low <= 0 && gap.high >= 0)) {
    throw new Error(
      `The sample no longer leans clear of zero, which the landing example says it does: ${FIX}.`,
    )
  }
  const run = fitness.run
  if (run.state !== 'slipping' || run.change === null || run.referenceHr === null) {
    throw new Error(
      `The sample's run shows "${run.state}", not the slip the landing example describes: ${FIX}.`,
    )
  }
  // The line's own size and range, so the example says what the sample's card says.
  const said = /^(\d+%) \((\d+ to \d+)\) off /.exec(fitnessLines(run, 'metric').changes[0] ?? '')
  if (said === null)
    throw new Error(`The sample run’s fitness change no longer names a size and range: ${FIX}.`)
  return {
    gap: { centre: gap.centre, low: gap.low, high: gap.high, lean: gap.lean },
    grades: { run: headline.run.grade, ride: headline.ride.grade },
    fitness: {
      referenceHr: run.referenceHr,
      change: run.change,
      shown: { size: said[1]!, range: said[2]! },
    },
  }
}
