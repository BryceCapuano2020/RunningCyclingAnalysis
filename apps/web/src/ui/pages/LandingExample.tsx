import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPace } from '@rca/core/units'
import { gapReading } from '../components/balanceScale'
import { balanceTitle } from '../components/headlineText'
import { LANDING_EXAMPLE } from '../landingExample'
import { SAMPLE_DESCRIPTION } from '../sampleAthlete'
import { SPORT_ORDER } from '../sports'
import { BalanceScale } from './BalanceScale'
import { laneOf, modelOf } from './balanceScaleModel'
import './LandingExample.css'

/** The figure of each sport's best 20 minutes as its lane prints it: a pace in the reader's units, or watts. */
const EFFORT: Record<Sport, (units: UnitSystem) => string> = {
  run: (units) => formatPace(LANDING_EXAMPLE.best20.runSpeedMs, units),
  ride: () => `${LANDING_EXAMPLE.best20.rideWatts} W`,
}

/**
 * An example of the Balance screen, drawn from the sample athlete: the answer's headline over the real level
 * scale, made from the sample's own figures with the same model and drawing Balance uses, so the example cannot
 * drift from the screen it stands for. It is the landing page's hero visual, labelled illustrative, and names
 * the sample.
 */
export function LandingExample({ units }: { units: UnitSystem }) {
  const reading = gapReading(LANDING_EXAMPLE.gap)
  const lanes = SPORT_ORDER.map((sport) =>
    laneOf(sport, LANDING_EXAMPLE.grades[sport], EFFORT[sport](units)),
  )
  const model = modelOf(lanes, reading, null)
  return (
    <figure className="landing-example">
      <figcaption className="eyebrow">{`Illustrative: the sample athlete, ${SAMPLE_DESCRIPTION}`}</figcaption>
      <p className="landing-example__title">{balanceTitle(reading)}</p>
      {model === null ? null : <BalanceScale model={model} />}
    </figure>
  )
}
