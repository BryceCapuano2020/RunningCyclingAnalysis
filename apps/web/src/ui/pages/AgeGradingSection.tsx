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

/** What the grade does not cover, in plain words: one fact a line. */
const LIMITS = [
  'Only the birth year is used.',
  'Until the birthday, the age can be one year too high.',
  'That moves the grade by about a year’s change in the standard.',
  'Up for adults, down for young athletes.',
  'The standards are for road races at sea level.',
  'Altitude, trail, track and cross-country are not adjusted for.',
  'Hilly courses and GPS error affect pace and measured distance.',
  'So a run’s grade is only as exact as its file.',
  'A training effort is not a race.',
  'A grade shows how a training effort compares with the standard.',
  'It is not a race result or a ranking.',
]

/** The method, the source and the limits of the age grades and levels, on How sure is this?. */
export function AgeGradingSection({ gradedSex }: AgeGradingSectionProps) {
  return (
    <section className="section" aria-labelledby={SECTION_ID.grades}>
      <h2 id={SECTION_ID.grades} tabIndex={-1}>
        Age grades and levels
      </h2>
      <p className="secondary">
        {`A run’s grade is the ${ROAD_STANDARDS_SOURCE.shortName} time for its distance, at your age and sex, divided by your time.`}
      </p>
      <p className="secondary">70% means 70% of standard pace.</p>
      <p className="secondary">{`Levels are bands of the grade: ${BAND_TEXT}.`}</p>
      <p className="secondary">{`Below ${RECREATIONAL_BELOW}% is Recreational.`}</p>
      <p className="secondary">A level name shows only when the whole range sits in one band.</p>
      <p className="secondary">
        Otherwise the number and its range show alone, with no level name.
      </p>
      <p className="secondary">A run’s grade uses its grade-adjusted pace (GAP).</p>
      <p className="secondary">GAP is the recorded pace, corrected for hills.</p>
      <p className="secondary">A ride has no published cycling standard.</p>
      <p className="secondary">Its best effort is converted to a running equivalent.</p>
      <p className="secondary">
        That is the flat running speed that costs the same energy over the same time.
      </p>
      <p className="secondary">The equivalent is graded like a run.</p>
      <p className="secondary">So a ride grade is an estimate.</p>
      <p className="secondary">
        The level target on Balance is the watts whose running equivalent grades to the other
        sport’s whole-percent grade.
      </p>
      <p className="secondary">Its range is the 5th to 95th percentile of the equivalence.</p>
      <p className="secondary">
        Grade by duration on Balance grades each sport’s best effort at each duration.
      </p>
      <p className="secondary">A ride comes with its range.</p>
      <p className="secondary">
        A sport is higher at a duration only where the run’s grade leaves the ride’s range.
      </p>
      <p className="secondary">Inside that range, the two are level.</p>
      <p className="secondary">Each effort is graded at your age on its own date.</p>
      <p className="secondary">It is not graded at the newest activity’s date.</p>
      <p className="secondary">Age changes across a period, so the date matters.</p>
      <p className="secondary">A run takes the date of its best effort at that duration.</p>
      <p className="secondary">A ride takes the date of its own best ride at that duration.</p>
      <p className="secondary">Its running equivalent comes from that ride.</p>
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
