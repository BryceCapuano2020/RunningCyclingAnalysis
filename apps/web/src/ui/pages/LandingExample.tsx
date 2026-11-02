import type { Sport } from '@rca/core/types'
import { BalanceMeter } from '../components/BalanceMeter'
import { gapReading } from '../components/balanceScale'
import { balanceTitle } from '../components/headlineText'
import type { GradeOutcome } from '../grades'
import { LANDING_EXAMPLE } from '../landingExample'
import type { UnitSystem } from '@rca/core/units'
import { SAMPLE_AGE, sampleDescription } from '../sampleAthlete'
import { FITNESS_STATE, trackModel } from '../fitnessModel'
import { SPORT_ORDER } from '../sports'
import { balanceLevels } from './levelsModel'
import { BalanceLevels } from './BalanceLevels'
import { FitnessGlyph } from './FitnessGlyph'
import { FitnessTrack } from './FitnessTrack'
import './LandingExample.css'

/** The example's grades as the page holds them: both graded, so the levels name each. */
const GRADES: Record<Sport, GradeOutcome> = {
  run: { kind: 'graded', age: SAMPLE_AGE, grade: LANDING_EXAMPLE.grades.run },
  ride: { kind: 'graded', age: SAMPLE_AGE, grade: LANDING_EXAMPLE.grades.ride },
}

const { fitness } = LANDING_EXAMPLE
const SLIP = FITNESS_STATE.slipping
const SLIP_TRACK = trackModel('run', fitness.change, null, { before: '', now: '' })

/**
 * An example of the home screen, drawn from the sample athlete: the answer's headline over the real meter and
 * the real levels line, made from the sample's own figures with the same components Balance uses, so the
 * example cannot drift from the screen it stands for. It is the landing page's hero visual, labelled
 * illustrative, and names the sample. The fitness finding is the second panel (LandingFitnessExample), set
 * below the actions so the first screen keeps Add files.
 */
export function LandingExample({ units = 'metric' }: { units?: UnitSystem }) {
  const reading = gapReading(LANDING_EXAMPLE.gap)
  const levels = balanceLevels({
    grades: GRADES,
    sports: SPORT_ORDER,
    inPeriod: { run: 1, ride: 1 },
    missingAge: null,
  })
  return (
    <figure className="landing-example">
      <figcaption className="eyebrow">{`Illustrative: the sample athlete, ${sampleDescription(units)}`}</figcaption>
      <p className="landing-example__title">{balanceTitle(reading)}</p>
      <BalanceMeter reading={reading} />
      <BalanceLevels model={levels} />
    </figure>
  )
}

/**
 * The example's second panel: the sample athlete's fitness finding, the state, one sentence and the change as
 * a track, from the same figures the sample's own analysis gives. It follows the actions on the landing page.
 */
export function LandingFitnessExample() {
  return (
    <figure className="landing-example landing-example--fitness">
      <figcaption className="eyebrow">Fitness at the same heart rate</figcaption>
      <div className="landing-example__fitness" data-sport="run" data-state="slipping">
        <p className="landing-example__state">
          <FitnessGlyph glyph={SLIP.glyph} />
          <span>{SLIP.label}</span>
        </p>
        <p className="landing-example__sentence">
          {`${fitness.shown.size} (${fitness.shown.range}) off your old level at ${fitness.referenceHr} bpm.`}
        </p>
        <FitnessTrack track={SLIP_TRACK} />
      </div>
    </figure>
  )
}
