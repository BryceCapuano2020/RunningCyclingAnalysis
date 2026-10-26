import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPace } from '@rca/core/units'
import { BalanceMeter } from '../components/BalanceMeter'
import { gapReading } from '../components/balanceScale'
import { balanceTitle } from '../components/headlineText'
import { LevelLadder } from '../components/LevelLadder'
import { SportIcon } from '../components/icons'
import { formatGrade } from '../gradeFormat'
import { LANDING_EXAMPLE } from '../landingExample'
import { SAMPLE_DESCRIPTION } from '../sampleAthlete'
import { SPORT_ORDER, SPORT_TITLE } from '../sports'
import './LandingExample.css'

/** One sport in the example: its level and grade, its level band, and its pace or power in plain words. */
function SportLine({ sport, units }: { sport: Sport; units: UnitSystem }) {
  const grade = LANDING_EXAMPLE.grades[sport]
  const measure =
    sport === 'run'
      ? `Pace ${formatPace(LANDING_EXAMPLE.runSpeedMs, units)}`
      : `Power ${LANDING_EXAMPLE.rideWatts} W`
  return (
    <div className="landing-example__sport">
      <p className="landing-example__sport-name">
        <SportIcon sport={sport} className={`landing-example__${sport}`} />
        {`${SPORT_TITLE[sport]} · ${grade.centre.level} · ${formatGrade(grade.centre.grade)}`}
      </p>
      <LevelLadder sport={sport} grade={grade} showKey={false} />
      <p className="secondary">{measure}</p>
    </div>
  )
}

/**
 * A small example of the Balance screen, drawn from the sample athlete: the balance meter, and each
 * sport's level and grade with its band. It is labelled illustrative and names the sample.
 */
export function LandingExample({ units }: { units: UnitSystem }) {
  const reading = gapReading(LANDING_EXAMPLE.gap)
  return (
    <figure className="landing-example">
      <figcaption className="eyebrow">Illustrative: the sample athlete</figcaption>
      <p className="landing-example__title">{balanceTitle(reading)}</p>
      <BalanceMeter reading={reading} />
      <div className="landing-example__stats">
        {SPORT_ORDER.map((sport) => (
          <SportLine key={sport} sport={sport} units={units} />
        ))}
      </div>
      <p className="secondary landing-example__sample">{`The sample is ${SAMPLE_DESCRIPTION}.`}</p>
    </figure>
  )
}
