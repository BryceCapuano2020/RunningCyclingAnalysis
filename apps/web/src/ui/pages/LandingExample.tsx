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
 * What the sample's run says, with no size: the size reads a point either way as the visit day moves (see
 * LandingFigures), so the card says the direction and the heart rate, which hold on every day.
 */
const FITNESS_SENTENCE = `Slower than your old level at ${fitness.referenceHr} bpm.`

/**
 * An example of the home screen, drawn from the sample athlete: the answer's headline over the real meter and
 * the real levels line, made from the sample's own figures with the same components Balance uses, so the
 * example cannot drift from the screen it stands for, and under them the sample's fitness finding, its state, one
 * sentence and the change as a track. It is the landing page's hero visual and one card under one label, the
 * sample athlete, so nothing in it reads as the visitor's own.
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
      <p className="landing-example__title">{balanceTitle(reading)}</p>
      <figcaption className="landing-example__label">
        <span className="landing-example__name">Sample athlete</span>
        {': '}
        <span className="landing-example__who">{sampleDescription(units)}</span>
      </figcaption>
      <BalanceMeter reading={reading} />
      <BalanceLevels model={levels} />
      <div className="landing-example__fitness" data-sport="run" data-state="slipping">
        <p className="landing-example__state">{SLIP.label}</p>
        <p className="landing-example__sentence">{FITNESS_SENTENCE}</p>
        <FitnessTrack track={SLIP_TRACK} />
      </div>
    </figure>
  )
}
