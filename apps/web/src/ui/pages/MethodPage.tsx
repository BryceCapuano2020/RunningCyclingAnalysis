import { useEffect } from 'react'
import { HR_BLOCK_S, HR_SKIP_S } from '@rca/core/constants'
import type { Period } from '@rca/core/period'
import { ALL_OUT_FRACTION } from '@rca/core/effort'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Curve } from '@rca/core/types'
import { formatDuration, formatPercent } from '@rca/core/units'
import { standingOf } from '../standing'
import { useHoldInputs } from '../holdContext'
import { heldPick, heldTexts } from '../resultHold'
import { rideHoldInputs } from '../rideLeftOut'
import { balanceOfPick } from '../components/balanceScale'
import {
  headlineBasis,
  headlineText,
  referenceDefinition,
  referenceText,
} from '../components/headlineText'
import { hardEffortsOnFile } from '../effortCaveat'
import { HEADLINE_LABEL } from '../grades'
import { NumText } from '../components/NumText'
import { MethodLines } from '../components/MethodLines'
import { MethodText } from '../components/MethodText'
import { TopicBody } from '../components/TopicBody'
import { SECTION_ID } from '../components/methodTopics'
import { plural } from '../components/plural'
import { WeightPrompt } from '../components/WeightPrompt'
import { gradedSexOf } from '../grades'
import { gradesOfStanding } from '../thresholdGrade'
import type { AgeProfile, GradeOutcome, HeadlineGrades } from '../grades'
import { MethodAnswer } from './MethodAnswerBlock'
import {
  ENERGY_BRIDGE,
  ENERGY_CROSS_CHECK,
  ENERGY_FALLBACK,
  ENERGY_RANGE,
  HELD_COMPARISON,
  HELD_ENERGY,
  HELD_NOTE,
  NEEDS_RIDE,
  NEEDS_RUN,
  NO_FILES_ENERGY,
  NO_FILES_EVIDENCE,
  RESTORING_EVIDENCE,
} from './methodEnergyCopy'
import { contentsOf, focusSection } from './methodContents'
import { TwentyMinuteEffort } from './TwentyMinuteEffort'
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

/** The model's own checks: the answer first, then the energy view, the grades and the evidence. */
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
  const gradeGapShown = gap !== null
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

  return (
    <div className="page-stack method">
      <div className="page-head">
        <PageHeading>Method</PageHeading>
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
        <ul>
          {contentsOf(showAccuracy).map(({ id, label }) => (
            <li key={id}>
              <button type="button" onClick={() => focusSection(id)}>
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section className="section band" aria-labelledby={SECTION_ID.energy}>
        <h2 id={SECTION_ID.energy} tabIndex={-1}>
          The energy view
        </h2>
        {!hasResult ? (
          <MethodText>
            <MethodLines lines={NO_FILES_ENERGY} />
            <TopicBody id="unit" />
            <TopicBody id="range" />
            <p className="secondary">{noResultLine}</p>
          </MethodText>
        ) : !weightKnown ? (
          <p className="secondary">{rides > 0 ? HELD_ENERGY : NEEDS_RIDE}</p>
        ) : runs === 0 || rides === 0 ? (
          <MethodText>
            <p className="secondary">{rides === 0 ? NEEDS_RIDE : NEEDS_RUN}</p>
            <TopicBody id="unit" />
            <TopicBody id="range" />
          </MethodText>
        ) : pick === null ? (
          <MethodText>
            <p className="secondary">
              <NumText text={`${HELD_COMPARISON} ${reason}`} />
            </p>
            <TopicBody id="unit" />
            <TopicBody id="range" />
          </MethodText>
        ) : (
          <>
            <MethodText>
              <MethodLines
                lines={[
                  ...(gradeGapShown ? ENERGY_CROSS_CHECK : ENERGY_FALLBACK),
                  ...(gradeGapShown ? ENERGY_BRIDGE : []),
                  ...ENERGY_RANGE,
                ]}
              />
              <ul className="method__facts">
                <li>
                  <NumText text={headlineText(pick.point).range} />
                </li>
                {headlineBasis(result.comparison, pick.calibrated).map((line) => (
                  <li key={line}>
                    <NumText text={line} />
                  </li>
                ))}
                <li>The range does not include every source of error.</li>
              </ul>
              <p className="secondary">Everywhere else, each sport uses its own units.</p>
              <TopicBody id="unit" />
              <TopicBody id="range" />
            </MethodText>
          </>
        )}
      </section>

      <AgeGradingSection gradedSex={gradedSex} />

      <LiftMethodSections />

      <section className="section band" aria-labelledby={SECTION_ID.heart}>
        <h2 id={SECTION_ID.heart} tabIndex={-1}>
          Heart-rate check
        </h2>
        <MethodText>
          <TopicBody id="heart" />
          <ul className="method__facts">
            {referenceDefinition().map((line) => (
              <li key={line}>
                <NumText text={line} />
              </li>
            ))}
            {reference && (
              <li>
                <NumText text={reference} />
              </li>
            )}
            {setAside && (
              <li>
                <NumText text={setAside} />
              </li>
            )}
            {hasResult && (
              <li>
                {`Heart rate is read in ${formatDuration(HR_BLOCK_S)} blocks of steady effort, taken after the first ${formatDuration(HR_SKIP_S)} of each activity.`}
              </li>
            )}
            {hasResult && weightKnown && (
              <li>Heart rate rises with energy rate at a different rate in each sport.</li>
            )}
            {hardEfforts && (
              <>
                <li>
                  Both best efforts reached at least {formatPercent(ALL_OUT_FRACTION)} of each
                  sport&rsquo;s max heart rate.
                </li>
                <li>Heart rate cannot tell a hard {HEADLINE_LABEL} from an all-out one.</li>
              </>
            )}
          </ul>
          <TwentyMinuteEffort />
          {hasResult && !weightKnown && rides > 0 && (
            <p className="secondary">
              <WeightPrompt />
            </p>
          )}
        </MethodText>
      </section>

      {showAccuracy && (
        <section className="section band" aria-labelledby={SECTION_ID.accuracy}>
          <h2 id={SECTION_ID.accuracy} tabIndex={-1}>
            Virtual power meter accuracy
          </h2>
          <MethodText>
            <TopicBody id="virtual" />
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
          </MethodText>
        </section>
      )}

      <HowThisWorks />
    </div>
  )
}
