import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPace } from '@rca/core/units'
import { BalanceMeter } from '../components/BalanceMeter'
import { gapReading } from '../components/balanceScale'
import { balanceTitle } from '../components/headlineText'
import { SportIcon } from '../components/icons'
import { SPORT_ORDER } from '../sports'

/** Illustrative numbers for the example, not anyone's data: about 6:40 /mi and 225 W at 75 kg. */
const EXAMPLE = {
  gap: { centre: 6, low: 2, high: 10, lean: 'run' as const },
  runSpeedMs: 4.03,
  rideWatts: 225,
  rideWkg: '3.0 W/kg',
}

/** One sport's threshold in the example, in the order the sport order gives. */
function ExampleStat({ sport, units }: { sport: Sport; units: UnitSystem }) {
  if (sport === 'run') {
    return (
      <div>
        <dt>
          <SportIcon sport="run" className="landing-example__run" />
          Threshold pace
        </dt>
        <dd className="stat-number">{formatPace(EXAMPLE.runSpeedMs, units)}</dd>
      </div>
    )
  }
  return (
    <div>
      <dt>
        <SportIcon sport="ride" className="landing-example__ride" />
        Threshold power
      </dt>
      <dd className="stat-number">{`${EXAMPLE.rideWatts} W`}</dd>
      <dd className="secondary">{EXAMPLE.rideWkg}</dd>
    </div>
  )
}

/** A small, fixed example of the Balance screen, so a visitor can see what they would get. */
export function LandingExample({ units }: { units: UnitSystem }) {
  const reading = gapReading(EXAMPLE.gap)
  const title = balanceTitle(reading)
  return (
    <figure className="landing-example">
      <figcaption className="eyebrow">Example result</figcaption>
      <p className="landing-example__title">{title}</p>
      <BalanceMeter reading={reading} />
      <dl className="landing-example__stats">
        {SPORT_ORDER.map((sport) => (
          <ExampleStat key={sport} sport={sport} units={units} />
        ))}
      </dl>
    </figure>
  )
}
