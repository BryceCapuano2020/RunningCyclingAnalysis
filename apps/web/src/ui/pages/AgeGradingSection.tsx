import { ROAD_STANDARDS_SOURCE, type Sex } from '@rca/core/grade'
import { StandardsCredit } from '../components/StandardsCredit'
import { SECTION_ID } from '../components/methodTopics'
import { LEVEL_BANDS, SEX_NOUN } from '../grades'
import { hrefFor } from '../route'
import './AgeGradingSection.css'

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
  'Hilly courses and GPS error affect the pace and the measured distance, so a run’s grade is ' +
    'only as exact as its file.',
  'A training effort is not a race. A grade shows how a training effort compares with the ' +
    'standard; it is not a race result or a ranking.',
]

/** The method, the source and the limits of the age grades and levels, on How sure is this?. */
export function AgeGradingSection({ gradedSex }: AgeGradingSectionProps) {
  return (
    <section className="section" aria-labelledby={SECTION_ID.grades}>
      <h2 id={SECTION_ID.grades} tabIndex={-1}>
        Age grades and levels
      </h2>
      <p className="secondary">
        A run is graded against the {ROAD_STANDARDS_SOURCE.shortName} for your age and sex: the
        standard time for the distance covered, divided by the time taken. A grade of 70% means the
        run was at 70% of the standard pace. Levels are bands of that grade: {BAND_TEXT}. Below{' '}
        {RECREATIONAL_BELOW}% is Recreational.
      </p>
      <p className="secondary">
        A run’s grade is read as recorded, from its flat pace: the recorded pace, corrected for
        hills.
      </p>
      <p className="secondary">
        A ride has no published cycling standard. Its best effort is converted to the flat running
        speed that costs the same energy over the same time, the running equivalent, and graded like
        a run, so a ride grade is an estimate.
      </p>
      <p className="secondary">
        The level target on Balance is the watts whose running equivalent grades to the other
        sport’s whole-percent grade, with the range from the equivalence’s 5th to 95th percentile.
      </p>
      <p className="secondary">
        Grade by duration on Balance grades each sport’s best effort at each duration, the ride with
        its range, and a sport is higher at a duration only where the run’s grade leaves the ride’s
        range; inside it, the two are level.
      </p>
      <p className="secondary">
        Each effort is graded at the age on its own date, not the newest activity’s, because age
        changes across a period. A run takes the date of its best effort at that duration. A ride
        takes the date of its own best ride at that duration, because its running equivalent comes
        from that ride.
      </p>
      <p className="secondary">
        {gradedSex !== null && `Your grades are for a ${SEX_NOUN[gradedSex]}. `}
        <a className="age-grading__link" href={hrefFor({ page: 'profile' })}>
          Change age and sex
        </a>
      </p>
      <p className="muted age-grading__source">
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
