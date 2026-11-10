import { useEffect } from 'react'
import type { Period } from '@rca/core/period'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Curve } from '@rca/core/types'
import { formatPercent } from '@rca/core/units'
import { standingOf } from '../standing'
import { useHoldInputs } from '../holdContext'
import { heldPick, heldTexts } from '../resultHold'
import { rideHoldInputs } from '../rideLeftOut'
import { balanceOfPick } from '../components/balanceScale'
import { headlineBasis, headlineText, referenceText } from '../components/headlineText'
import { hardEffortsOnFile } from '../effortCaveat'
import { NumText } from '../components/NumText'
import { plural } from '../components/plural'
import { gradedSexOf } from '../grades'
import { gradesOfStanding } from '../thresholdGrade'
import type { AgeProfile, GradeOutcome, HeadlineGrades } from '../grades'
import { MethodAnswer } from './MethodAnswerBlock'
import {
  HELD_COMPARISON,
  HELD_ENERGY,
  HELD_NOTE,
  NEEDS_RIDE,
  NEEDS_RUN,
  NO_FILES_EVIDENCE,
  RESTORING_EVIDENCE,
} from './methodEnergyCopy'
import { RACE_FACTS, THRESHOLD_FACTS, THRESHOLD_LEAD } from './methodCopy'
import { contentsOf, focusSection } from './methodContents'
import { MethodFacts, MethodSection } from './MethodSection'
import { EnergySection, HeartSection, VirtualPowerSection } from './MethodResultSections'
import type { EnergyReading } from './MethodResultSections'
import { AgeGradingSection } from './AgeGradingSection'
import { HowThisWorks } from './HowThisWorks'
import { LiftMethodSections } from './LiftMethodSections'
import type { HeartRateJudgement } from '@rca/core/digest/setAsideTypes'
import { setAsideText } from '../analysis/setAsideCopy'
import { clearRequestedMethodSection, requestedMethodSection } from '../components/methodSection'
import './MethodPage.css'
import { PageHeading } from '../components/PageHeading'

export interface MethodPageProps {
  /** The analysis, or null when no files are loaded: the method still reads, and each chart says so. */
  result: AnalysisResult | null
  /** What the heart rate set aside was judged against, the library's, which the line on it cites. */
  heartRateJudgement: HeartRateJudgement
  /** The year of birth and sex for the grades, or null while either is missing. */
  profile: AgeProfile | null
  /** The period the counts are over, named by its dates. */
  period?: Period
  /** False while no body weight is entered: the ride figures wait for one, as Balance does. */
  weightKnown: boolean
  /** True while a kept library is still loading, which may still bring the results. */
  restoring?: boolean
}

/** A ride's grade withheld, so that only a run's grade is left to say whose grades these are. */
function runOnly(headline: HeadlineGrades | null): HeadlineGrades | null {
  if (headline === null) return null
  const noRide: GradeOutcome = { kind: 'gap', reason: '' }
  return { run: headline.run, ride: noRide }
}

/** The activities that set a best effort on a curve: the ones the estimates rest on. */
function contributorsOf(curve: Curve): number {
  const ids = curve.flatMap((point) => (point.activityId === null ? [] : [point.activityId]))
  return new Set(ids).size
}

/** How each figure is worked out: the answer first, then one section a figure, each led by the line a reader wants. */
export function MethodPage({
  result,
  heartRateJudgement,
  profile,
  period,
  weightKnown,
  restoring = false,
}: MethodPageProps) {
  const hasResult = result !== null
  // The slot's line while there are no results: a kept library may still bring them.
  const noResultLine = restoring ? RESTORING_EVIDENCE : NO_FILES_EVIDENCE
  const runs = result ? contributorsOf(result.runCurve) : 0
  const rides = result ? contributorsOf(result.rideCurve) : 0
  const holdInputs = useHoldInputs()
  const standing = profile === null || result === null ? null : standingOf(result, profile)
  const headline = standing === null || result === null ? null : gradesOfStanding(result, standing)
  // A ride at the top of the age tables, or one with no usable power, is out of the comparison as Balance leaves it out.
  const rideHold =
    result === null || headline === null || !weightKnown
      ? holdInputs
      : rideHoldInputs(headline.ride, result, holdInputs)
  const pick = result ? heldPick(result, rideHold).pick : null
  const held = result ? heldTexts(result, period, rideHold) : null
  // Under a hold the reason and what lifts it are the hold's; else the activities or the 20 minute effort a sport lacks.
  const reason =
    held === null ? '' : held.hold === null ? held.reason : `${held.reason} ${held.action}`
  const effort = result?.effort.find((e) => e.durationS === pick?.point.durationS) ?? null
  const reference = result ? referenceText(result) : null
  const setAside = result ? setAsideText(result, heartRateJudgement) : null
  const accuracy = result ? result.virtualAccuracy : null
  // The accuracy section shows with no result too, where it says what its check needs.
  const showAccuracy = accuracy !== null || !hasResult
  // Without a weight a ride's grade is worked out on the placeholder body mass, so only a run's grade
  // may say whose grades these are.
  const gradedSex = gradedSexOf(weightKnown ? headline : runOnly(headline), profile)
  const gap = standing?.lead ?? null
  // The balance is the one Balance states, so the answer and the headline cannot disagree.
  const balance = weightKnown ? balanceOfPick(gap, pick) : null
  const hardEfforts = hardEffortsOnFile(effort)

  // A link from another page asked for a section here; focus it once this page has mounted, after
  // the page's own focus on its heading.
  useEffect(() => {
    const id = requestedMethodSection()
    if (id === null) return
    const timer = window.setTimeout(() => {
      clearRequestedMethodSection()
      focusSection(id)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      // Left before the focus, so the request is stale. Cleared a tick later, so that StrictMode's
      // immediate re-run of this effect still finds it.
      window.setTimeout(clearRequestedMethodSection, 0)
    }
  }, [])

  const energy: EnergyReading = !hasResult
    ? { kind: 'line', text: noResultLine }
    : !weightKnown
      ? rides > 0
        ? { kind: 'line', text: HELD_ENERGY, askWeight: true }
        : { kind: 'line', text: NEEDS_RIDE }
      : runs === 0 || rides === 0
        ? { kind: 'line', text: rides === 0 ? NEEDS_RIDE : NEEDS_RUN }
        : pick === null
          ? { kind: 'line', text: `${HELD_COMPARISON} ${reason}` }
          : {
              kind: 'range',
              gapShown: gap !== null,
              facts: [
                headlineText(pick.point).range,
                ...headlineBasis(result.comparison, pick.calibrated),
              ],
            }
  const heartFacts = [reference, setAside].filter((line): line is string => line !== null)

  return (
    <div className="page-stack method">
      <div className="page-head method__head">
        <PageHeading>Method</PageHeading>
        <p className="method__lede">How each figure is worked out.</p>
      </div>

      <MethodAnswer
        balance={balance}
        hasResult={hasResult}
        waitsForWeight={hasResult && !weightKnown && rides > 0}
        runs={runs}
        rides={rides}
        weightKnown={weightKnown}
        period={period ?? null}
      />

      <nav className="method__contents" aria-label="On this page">
        <p className="eyebrow method__contents-title" aria-hidden="true">
          Contents
        </p>
        <ol>
          {contentsOf(showAccuracy).map(({ id, label }, index) => (
            <li key={id}>
              <button type="button" onClick={() => focusSection(id)}>
                <span className="method__contents-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="method__contents-label">{label}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <MethodSection section="thresholds" lead={THRESHOLD_LEAD} facts={THRESHOLD_FACTS}>
        <h3>Race times</h3>
        <MethodFacts facts={RACE_FACTS} />
      </MethodSection>

      <AgeGradingSection gradedSex={gradedSex} />

      <EnergySection reading={energy} />

      <LiftMethodSections />

      <HeartSection facts={heartFacts} hardEfforts={hardEfforts} />

      {showAccuracy && (
        <VirtualPowerSection>
          {accuracy !== null &&
            (weightKnown ? (
              accuracy.nSegments > 0 && (
                <p>
                  <NumText
                    text={`On ${plural(accuracy.nSegments, 'climb')}, estimated power was within ${formatPercent(accuracy.mape)} of your power meter on average.`}
                  />
                </p>
              )
            ) : (
              <p className="secondary">{HELD_NOTE}</p>
            ))}
        </VirtualPowerSection>
      )}

      <HowThisWorks />
    </div>
  )
}
