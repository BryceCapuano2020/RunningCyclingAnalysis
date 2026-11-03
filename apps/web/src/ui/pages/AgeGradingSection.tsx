import { ROAD_STANDARDS_SOURCE, type Sex } from '@rca/core/grade'
import { MethodLines } from '../components/MethodLines'
import { MethodText } from '../components/MethodText'
import { StandardsCredit } from '../components/StandardsCredit'
import { SECTION_ID } from '../components/methodTopics'
import { HEADLINE_LABEL, LEVEL_BANDS, SEX_NOUN } from '../grades'
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
      <MethodText>
        <MethodLines
          lines={[
            `A run’s grade is the ${ROAD_STANDARDS_SOURCE.shortName} time for its distance, at your age and sex, divided by your time.`,
            '70% means 70% of standard pace.',
            `Levels are bands of the grade: ${BAND_TEXT}.`,
            `Below ${RECREATIONAL_BELOW}% is Recreational.`,
            'A ride’s level is the band of its best estimate.',
            'Its range, drawn on the ladder, can reach the next band.',
            'A run’s grade uses its grade-adjusted pace (GAP).',
            'GAP is the recorded pace, corrected for hills.',
          ]}
        />
        <MethodLines
          lines={[
            'A ride has no published cycling standard.',
            'Its best effort is converted to a running equivalent.',
            'That is the flat running speed that costs the same energy over the same time.',
            'The equivalent is graded like a run.',
            'So a ride grade is an estimate.',
            `The grades of each sport’s best ${HEADLINE_LABEL} give the balance.`,
          ]}
        />
        <MethodLines
          lines={[
            'The level target on Balance is what the lower sport’s best effort would need to be to match the other.',
            'It is in that sport’s own unit.',
            'For a ride, it is the watts whose running equivalent grades to the other sport’s whole-percent grade.',
            'Its range is the 5th to 95th percentile of the equivalence.',
          ]}
        />
        <MethodLines
          lines={[
            'Grade by duration on Balance grades each sport’s best effort at each duration.',
            'A ride comes with its range.',
            'A sport is higher at a duration only where the run’s grade leaves the ride’s range.',
            'Inside that range, the two are level.',
          ]}
        />
        <MethodLines
          lines={[
            'Each effort is graded at your age on its own date.',
            'It is not graded at the newest activity’s date.',
            'Age changes across a period, so the date matters.',
            'A run takes the date of its best effort at that duration.',
            'A ride takes the date of its own best ride at that duration.',
            'Its running equivalent comes from that ride.',
          ]}
        />
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
      </MethodText>
    </section>
  )
}
