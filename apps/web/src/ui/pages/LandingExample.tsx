import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatPace } from '@rca/core/units'
import { gapReading } from '../components/balanceScale'
import { balanceTitle, rangeText } from '../components/headlineText'
import { LevelLadder } from '../components/LevelLadder'
import { SportIcon } from '../components/icons'
import { formatGrade } from '../gradeFormat'
import { LANDING_EXAMPLE } from '../landingExample'
import { SAMPLE_DESCRIPTION } from '../sampleAthlete'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'
import './LandingExample.css'

/** A sport's measure in the example: its pace in the units the reader uses, or its power in watts. */
const MEASURE: Record<Sport, (units: UnitSystem) => string> = {
  run: (units) => `Pace ${formatPace(LANDING_EXAMPLE.runSpeedMs, units)}`,
  ride: () => `Power ${LANDING_EXAMPLE.rideWatts} W`,
}

/** One sport in the example: its level and grade, its level band, and its pace or power in plain words. */
function SportLine({ sport, units }: { sport: Sport; units: UnitSystem }) {
  const grade = LANDING_EXAMPLE.grades[sport]
  const measure = MEASURE[sport](units)
  return (
    <div className="landing-example__sport">
      <p className="landing-example__sport-name">
        <SportIcon sport={sport} />
        {`${SPORT_LABEL[sport]} · ${grade.centre.level} · ${formatGrade(grade.centre.grade)}`}
      </p>
      <LevelLadder sport={sport} grade={grade} showKey={false} showScale={false} />
      <p className="secondary">{measure}</p>
    </div>
  )
}

/**
 * An example of the Balance screen, drawn from the sample athlete: the lean as a display figure with its
 * range, then each sport's level and grade on its bar, with its pace or power. It is the landing page's
 * hero visual, labelled illustrative, and names the sample. It carries no key and no scale labels: the
 * lines above the bars name the levels.
 */
export function LandingExample({ units }: { units: UnitSystem }) {
  const reading = gapReading(LANDING_EXAMPLE.gap)
  return (
    <figure className="landing-example">
      <figcaption className="eyebrow">{`Illustrative: the sample athlete, ${SAMPLE_DESCRIPTION}`}</figcaption>
      <div className="landing-example__lead">
        <p className="landing-example__title">{balanceTitle(reading)}</p>
        <p className="landing-example__figure">
          <span className="landing-example__number">{`+${Math.round(reading.lead.centre)}`}</span>
          <span className="landing-example__unit">pts toward running</span>
          <span className="landing-example__range secondary">{`range ${rangeText(reading)}`}</span>
        </p>
      </div>
      <div className="landing-example__stats">
        {SPORT_ORDER.map((sport) => (
          <SportLine key={sport} sport={sport} units={units} />
        ))}
      </div>
    </figure>
  )
}
