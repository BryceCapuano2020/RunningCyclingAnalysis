import { ROAD_STANDARDS_SOURCE, type Sex } from '@rca/core/grade'
import { StandardsCredit } from '../components/StandardsCredit'
import { LEVEL_BANDS, SEX_NOUN } from '../grades'

export interface AgeGradingSectionProps {
  /** The sex the grades are for, when a grade shows on this page; null when none does. */
  gradedSex: Sex | null
}

/** The bands that have a lower bound: every level except Recreational, lowest first. */
const BANDS = LEVEL_BANDS.filter((band) => band.min > 0)

const BAND_TEXT = BANDS.map((band) => `${band.name} from ${Math.round(band.min * 100)}%`).join(', ')

/** Recreational is everything below the lowest band. */
const RECREATIONAL_BELOW = Math.round(BANDS[0]!.min * 100)

/** What the grade does not cover, in plain words. */
const LIMITS = [
  'Only the birth year is used, so until the birthday the age can be one year too high. That ' +
    'moves the grade by about a year’s change in the standard: up for adults, down for young ' +
    'athletes.',
  'The standards are for road races at sea level. Altitude, trail, track and cross-country ' +
    'are not adjusted for.',
  'Hilly courses and GPS error make the pace an estimate, and the measured distance can be off.',
  'A training effort is not a race. A training grade is an estimate, not a race result or a ' +
    'ranking.',
]

/** The method, the source and the limits of the age grades, on How sure is this?. */
export function AgeGradingSection({ gradedSex }: AgeGradingSectionProps) {
  return (
    <section className="section" aria-labelledby="method-grades">
      <h2 id="method-grades">Age grading</h2>
      <p className="secondary">
        A run is graded against the {ROAD_STANDARDS_SOURCE.shortName} for the athlete&rsquo;s age
        and sex: the standard time for the distance covered, divided by the time taken. A grade of
        70% means the run was at 70% of the standard pace. Levels are bands of that grade:{' '}
        {BAND_TEXT}. Below {RECREATIONAL_BELOW}% is Recreational.
      </p>
      <p className="secondary">
        Each effort is graded at the age on its own date, not the newest activity&rsquo;s, because
        age changes across a period. Age is counted from your birth year on the date of each effort.
        A run takes the date of its best effort at that duration. A ride takes the date of its own
        best ride at that duration, because its running equivalent comes from that ride.
      </p>
      <p className="secondary">
        A run&rsquo;s grade is one activity&rsquo;s estimate. A ride has no published cycling
        standard, so its best effort is converted to the flat running speed that costs the same
        energy over the same time, then graded like a run. Its range is the model&rsquo;s 90% range
        for that conversion, so it is an estimate too.
      </p>
      {gradedSex !== null && (
        <p className="secondary">{`Your grades are for a ${SEX_NOUN[gradedSex]}.`}</p>
      )}
      <p className="muted">
        Source: <StandardsCredit />, a public domain dedication.
      </p>
      <ul className="method__facts">
        {LIMITS.map((limit) => (
          <li key={limit}>{limit}</li>
        ))}
      </ul>
    </section>
  )
}
