import { CYCLING_ANCHOR_WKG } from '@rca/core/display'
import { ROAD_STANDARDS_SOURCE, type Sex } from '@rca/core/grade'
import { StandardsCredit } from '../components/StandardsCredit'
import { LEVEL_BANDS, SEX_NOUN } from '../grades'
import { OWN_LEVEL_MEANING } from '../levelMeaning'
import { hrefFor } from '../route'
import { MethodFacts, MethodSection } from './MethodSection'
import './AgeGradingSection.css'

export interface AgeGradingSectionProps {
  /** The sex the grades are for, when a grade shows on this page; null when none does. */
  gradedSex: Sex | null
}

const LEAD = 'An age grade is your effort as a share of world class at your age and sex.'

const FACTS = [
  `A run’s grade is the ${ROAD_STANDARDS_SOURCE.shortName} time for its distance at your age and sex, over your time.`,
  'It uses grade-adjusted pace (GAP), corrected for hills.',
  `A ride’s W/kg is set against the best riders’ hour (${CYCLING_ANCHOR_WKG.male.toFixed(2)} W/kg men, ${CYCLING_ANCHOR_WKG.female.toFixed(2)} women), then graded as a run at that share.`,
  'A threshold is graded at your age on the day of its strongest effort.',
  'On Balance’s age grade by effort length, a sport is higher only where the run’s grade is outside the ride’s range.',
]

const whole = (share: number) => Math.round(share * 100)

/** Each band, highest first, as "National is 80% to 89%", with the meaning of the app's own bands below Local. */
const LEVELS = [...LEVEL_BANDS].reverse().map((band, index, bands) => {
  const above = bands[index - 1]
  const span =
    above === undefined
      ? `${whole(band.min)}% and up`
      : band.min === 0
        ? `under ${whole(above.min)}%`
        : `${whole(band.min)}% to ${whole(above.min) - 1}%`
  const meaning = OWN_LEVEL_MEANING.find((level) => level.name === band.name)?.meaning
  return meaning === undefined ? `${band.name} is ${span}.` : `${band.name} is ${span}: ${meaning}`
})

const LIMITS = [
  'Only your birth year is used, so before your birthday the age can be a year high.',
  'The standards are for road races at sea level.',
]

/** The method, the bands, the source and the limits of the age grades, on Method. */
export function AgeGradingSection({ gradedSex }: AgeGradingSectionProps) {
  return (
    <MethodSection section="grades" lead={LEAD} facts={[...FACTS, ...LIMITS]}>
      <h3>Levels</h3>
      <p className="secondary">
        Levels are bands of the grade: the WMA classes from Local up, this app’s own below.
      </p>
      <MethodFacts facts={LEVELS} />
      <p className="secondary">
        {gradedSex !== null && `Your grades are for a ${SEX_NOUN[gradedSex]}. `}
        <a className="age-grading__link" href={hrefFor({ page: 'profile' })}>
          Change age and sex
        </a>
      </p>
      <p className="muted age-grading__source">
        Source: <StandardsCredit />, a public domain dedication.
      </p>
    </MethodSection>
  )
}
