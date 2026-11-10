import { gapReading } from '../components/balanceScale'
import { LevelTriangle } from '../components/LevelTriangle'
import { NumText } from '../components/NumText'
import { LANDING_EXAMPLE } from '../landingExample'
import type { UnitSystem } from '@rca/core/units'
import { sampleDescription } from '../sampleAthlete'
import type { TriangleView } from '../triangleSports'
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

/**
 * An example of the home screen, drawn from the sample athlete: the answer's headline and line over the real level
 * triangle, made from the sample's own figures with the same components Balance uses, so the
 * example cannot drift from the screen it stands for. It is the landing page's hero visual and one card under one
 * label, the sample athlete, so nothing in it reads as the visitor's own.
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
    </figure>
  )
}
