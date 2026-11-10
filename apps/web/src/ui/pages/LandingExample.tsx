import { gapReading } from '../components/balanceScale'
import { LevelTriangle } from '../components/LevelTriangle'
import { NumText } from '../components/NumText'
import { LANDING_EXAMPLE } from '../landingExample'
import type { UnitSystem } from '@rca/core/units'
import { sampleDescription } from '../sampleAthlete'
import { FITNESS_STATE, trackModel } from '../fitnessModel'
import type { TriangleView } from '../triangleSports'
import { FitnessTrack } from './FitnessTrack'
import { triangleAnswer, triangleTitleText } from './triangleCopy'
import './LandingExample.css'

/** The example's triangle as the page holds it: run and ride graded, and lifting in its state before it has a grade. */
const TRIANGLE: TriangleView = {
  grades: {
    run: { kind: 'graded', grade: LANDING_EXAMPLE.grades.run },
    ride: { kind: 'graded', grade: LANDING_EXAMPLE.grades.ride },
    lift: { kind: 'gap' },
  },
  notes: {},
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
 * An example of the home screen, drawn from the sample athlete: the answer's headline and line over the real level
 * triangle, made from the sample's own figures with the same components Balance uses, so the
 * example cannot drift from the screen it stands for, and under them the sample's fitness finding, its state, one
 * sentence and the change as a track. It is the landing page's hero visual and one card under one label, the
 * sample athlete, so nothing in it reads as the visitor's own.
 */
export function LandingExample({ units = 'metric' }: { units?: UnitSystem }) {
  const { title, line } = triangleAnswer(gapReading(LANDING_EXAMPLE.gap), TRIANGLE, undefined)
  return (
    <figure className="landing-example">
      <p className="landing-example__title">{triangleTitleText(title)}</p>
      <figcaption className="landing-example__label">
        <span className="landing-example__name">Sample athlete</span>
        {': '}
        <span className="landing-example__who">{sampleDescription(units)}</span>
      </figcaption>
      {line === null ? null : (
        <p className="landing-example__line">
          <NumText text={line} />
        </p>
      )}
      <LevelTriangle view={TRIANGLE} linked={false} />
      <div className="landing-example__fitness" data-sport="run" data-state="slipping">
        <p className="landing-example__state">{SLIP.label}</p>
        <p className="landing-example__sentence">{FITNESS_SENTENCE}</p>
        <FitnessTrack track={SLIP_TRACK} />
      </div>
    </figure>
  )
}
