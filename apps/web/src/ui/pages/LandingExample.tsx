import type { UnitSystem } from '@rca/core/units'
import { formatPace } from '@rca/core/units'
import { BalanceMeter } from '../components/BalanceMeter'
import { SportIcon } from '../components/icons'

/** Illustrative numbers for the example, not anyone's data: about 6:40 /mi and 225 W at 75 kg. */
const EXAMPLE = {
  ratio: { p05: 1.04, p50: 1.12, p95: 1.2 },
  runSpeedMs: 4.03,
  rideWatts: 225,
  rideWkg: '3.0 W/kg',
}

/** A small, fixed example of the Balance screen, so a visitor can see what they would get. */
export function LandingExample({ units }: { units: UnitSystem }) {
  return (
    <figure className="landing-example">
      <figcaption className="eyebrow">Example result</figcaption>
      <p className="landing-example__title">Your balance leans toward running</p>
      <BalanceMeter ratio={EXAMPLE.ratio} />
      <dl className="landing-example__stats">
        <div>
          <dt>
            <SportIcon sport="run" className="landing-example__run" />
            Threshold pace
          </dt>
          <dd className="stat-number">{formatPace(EXAMPLE.runSpeedMs, units)}</dd>
        </div>
        <div>
          <dt>
            <SportIcon sport="ride" className="landing-example__ride" />
            Threshold power
          </dt>
          <dd className="stat-number">{`${EXAMPLE.rideWatts} W`}</dd>
          <dd className="secondary">{EXAMPLE.rideWkg}</dd>
        </div>
      </dl>
    </figure>
  )
}
