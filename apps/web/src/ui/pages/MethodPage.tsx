import { useEffect } from 'react'
import { HR_BLOCK_S, HR_SKIP_S } from '@rca/core/constants'
import type { Period } from '@rca/core/period'
import { ALL_OUT_FRACTION } from '@rca/core/effort'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { Curve } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { formatDuration, formatPercent } from '@rca/core/units'
import { AccuracyScatter, CurveChart, HrScatter, RatioChart } from '../charts'
import { gapOfHeadline } from '../balanceGap'
import { pickHeadline } from '../components'
import { balanceOfPick } from '../components/balanceScale'
import type { BalanceReading } from '../components/balanceScale'
import {
  balanceTitle,
  headlineBasis,
  headlineText,
  referenceDefinition,
  referenceText,
} from '../components/headlineText'
import { hardEffortsOnFile } from '../effortCaveat'
import { CheckIcon, WarningIcon } from '../components/icons'
import { Methodology, TopicBody } from '../components/Methodology'
import { HOW_THIS_WORKS, SECTION_ID } from '../components/methodTopics'
import { plural } from '../components/plural'
import { WeightPrompt } from '../components/WeightPrompt'
import { periodDates } from '../components/rangeOptions'
import { gradedSexOf, headlineGrades } from '../grades'
import type { AgeProfile, GradeOutcome, HeadlineGrades } from '../grades'
import { hrefFor } from '../route'
import { activityNames } from '../records'
import { PAGE_HEADING_ID } from './pageHeading'
import { TwentyMinuteEffort } from './TwentyMinuteEffort'
import { AgeGradingSection } from './AgeGradingSection'
import { CalculatedSection } from './CalculatedSection'
import { EvidenceDisclosure } from './EvidenceDisclosure'
import type { HeartRateJudgement } from '@rca/core/digest/setAsideTypes'
import { setAsideText } from '../analysis/setAsideCopy'
import { clearRequestedMethodSection, requestedMethodSection } from '../components/methodSection'
import './MethodPage.css'

export interface MethodPageProps {
  /** The analysis, or null when no files are loaded: the method still reads, and each chart says so. */
  result: AnalysisResult | null
  /** What the heart rate set aside was judged against, the library's, which the line on it cites. */
  heartRateJudgement: HeartRateJudgement
  units: UnitSystem
  /** The year of birth and sex for the grades, or null while either is missing. */
  profile: AgeProfile | null
  /** The period the counts are over, named by its dates. */
  period?: Period
  /** False while no body weight is entered: the ride figures wait for one, as Balance does. */
  weightKnown: boolean
  /** True while a kept library is still loading, which may still bring the results. */
  restoring?: boolean
}

/** The note where a ride figure is held: the same reason as the energy view, said once there. */
const HELD_NOTE = 'Waits for your weight, as the energy view does.'
/** Where a chart would be, while no files are loaded. */
const NO_FILES_EVIDENCE = 'Add your files to see this evidence.'
/** Where a chart would be, while a kept library loads and may still bring the results. */
const RESTORING_EVIDENCE = 'Your saved results are loading.'
/** The energy view before any results: what it will show, since there is no ratio to name yet. */
const NO_FILES_ENERGY =
  'Once your files are loaded, this view puts running and cycling on one scale, described below.'
/** The energy view, when Balance shows the age-grade gap, and when it shows the energy ratio instead. */
const ENERGY_CROSS_CHECK =
  'The energy view is a cross-check of the age-grade gap on Balance. Near even, the energy check can lean the other way from the age-grade gap.'
const ENERGY_FALLBACK =
  'When Balance has no age-grade gap to show, it shows the energy ratio instead: running’s energy rate as a percentage of cycling’s. This view is that ratio.'
/** The energy view itself, while it waits: the one held line that is not the prompt. */
const HELD_ENERGY = 'Waits for your weight, as Balance does.'
/** The energy view with no ride to compare a run with, so a weight would not change what it shows. */
const NEEDS_RIDE = 'Needs a ride to compare with running.'
/** The energy view with no run to compare a ride with: the run-equivalent of NEEDS_RIDE. */
const NEEDS_RUN = 'Needs a run to compare with cycling.'
/** The answer's estimates line when no run has a usable effort to count. */
const NO_RUN_EFFORT = 'No run has a usable effort yet.'
/** Line two of the answer while a ride's grade waits for the weight. */
const WAITS_FOR_WEIGHT = 'Your balance waits for your weight.'

/**
 * Line two of the answer: which way the balance leans, in Balance's words, and whether even is inside
 * the range the model gives. Null while no balance is stated.
 */
function answerVerdict(balance: BalanceReading | null, waitsForWeight: boolean): string | null {
  if (waitsForWeight) return WAITS_FOR_WEIGHT
  if (balance === null) return null
  const even = balance.lean === 'even' ? 'inside' : 'outside'
  return `${balanceTitle(balance)}. Even is ${even} its range.`
}

/**
 * The estimates line of the answer, once there are results: what the library's counts estimate. A ride
 * figure needs the weight and a ride, and a run threshold needs a run, so the line names only those.
 */
function estimatesOf(runs: number, rides: number, weightKnown: boolean): string {
  if (!weightKnown || rides === 0) {
    if (runs === 0) return NO_RUN_EFFORT
    return `Run thresholds are estimates from ${plural(runs, 'run')} with a usable effort.`
  }
  if (runs === 0) {
    return `Ride levels and ride power without a meter are estimates from ${plural(rides, 'ride')} with a usable effort.`
  }
  return `Thresholds, ride levels, the balance and ride power without a meter are estimates from ${plural(runs, 'run')} and ${plural(rides, 'ride')} with a usable effort.`
}

interface ContentsEntry {
  id: string
  label: string
}

/** Each section's name, as the contents and the answer's chips name it. */
const SECTION_NAME: Record<keyof typeof SECTION_ID, string> = {
  energy: 'The energy view',
  grades: 'Age grades and levels',
  heart: 'Heart-rate check',
  accuracy: 'Virtual power meter accuracy',
  calculated: 'What is calculated',
  how: 'How this works and what it assumes',
}

/** The sections on the page, in order. The accuracy section shows only when there is one. */
function contentsOf(hasAccuracy: boolean): ContentsEntry[] {
  return [
    { id: SECTION_ID.energy, label: SECTION_NAME.energy },
    { id: SECTION_ID.grades, label: SECTION_NAME.grades },
    { id: SECTION_ID.heart, label: SECTION_NAME.heart },
    ...(hasAccuracy ? [{ id: SECTION_ID.accuracy, label: SECTION_NAME.accuracy }] : []),
    { id: SECTION_ID.calculated, label: SECTION_NAME.calculated },
    { id: SECTION_ID.how, label: SECTION_NAME.how },
  ]
}

/**
 * Moves focus to a section's heading. A fragment link would change the hash route, so the contents
 * use buttons that focus the heading instead.
 */
function focusSection(id: string) {
  document.getElementById(id)?.focus()
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
  units,
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
  const pick = result ? pickHeadline(result.comparison) : null
  const effort = result?.effort.find((e) => e.durationS === pick?.point.durationS) ?? null
  const reference = result ? referenceText(result) : null
  const setAside = result ? setAsideText(result, heartRateJudgement) : null
  const accuracy = result ? result.virtualAccuracy : null
  // The accuracy section shows with no result too, where it says what its check needs.
  const showAccuracy = accuracy !== null || !hasResult
  const headline = profile === null || result === null ? null : headlineGrades(result, profile)
  // Without a weight a ride's grade is worked out on the placeholder body mass, so only a run's grade
  // may say whose grades these are.
  const gradedSex = gradedSexOf(weightKnown ? headline : runOnly(headline), profile)
  const gap = headline === null ? null : gapOfHeadline(headline)
  const gradeGapShown = gap !== null
  // The balance is the one Balance states, so the answer and the headline cannot disagree.
  const balance = weightKnown ? balanceOfPick(gap, pick) : null
  const verdict = answerVerdict(balance, hasResult && !weightKnown && rides > 0)
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
      {hasResult && (
        <a className="link-arrow" href={hrefFor({ page: 'balance' })}>
          <span aria-hidden="true">&larr;</span> Back to Balance
        </a>
      )}
      <div className="page-head">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          How sure is this?
        </h1>
        {period && <p className="muted">{`Counted over ${periodDates(period)}.`}</p>}
      </div>

      <ul className="lede method__answer" aria-label="The short answer">
        <li>
          <button
            type="button"
            className="chip chip--good method__chip"
            aria-label={`Recorded: see ${SECTION_NAME.grades}`}
            onClick={() => focusSection(SECTION_ID.grades)}
          >
            <CheckIcon />
            Recorded
          </button>
          <span>Running efforts, and ride power from a power meter, are recorded.</span>
        </li>
        <li>
          <button
            type="button"
            className="chip method__chip"
            aria-label={`Estimated: see ${SECTION_NAME.grades}`}
            onClick={() => focusSection(SECTION_ID.grades)}
          >
            <WarningIcon />
            Estimated
          </button>
          <span className="method__answer-text">
            {verdict !== null && <span>{verdict} </span>}
            <span>
              {hasResult
                ? estimatesOf(runs, rides, weightKnown)
                : 'Thresholds, ride levels and the balance are estimates.'}
            </span>
          </span>
        </li>
        <li>
          <button
            type="button"
            className="chip method__chip"
            aria-label={`Checks below: see ${SECTION_NAME.heart}`}
            onClick={() => focusSection(SECTION_ID.heart)}
          >
            Checks below
          </button>
          <span>These checks show how far to trust them.</span>
        </li>
      </ul>

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

      <section className="section" aria-labelledby={SECTION_ID.energy}>
        <h2 id={SECTION_ID.energy} tabIndex={-1}>
          The energy view
        </h2>
        {!hasResult ? (
          <>
            <p className="secondary">{NO_FILES_ENERGY}</p>
            <TopicBody id="unit" />
            <TopicBody id="range" />
            <p className="secondary">{noResultLine}</p>
          </>
        ) : !weightKnown ? (
          <p className="secondary">{rides > 0 ? HELD_ENERGY : NEEDS_RIDE}</p>
        ) : runs === 0 || rides === 0 ? (
          <>
            <p className="secondary">{rides === 0 ? NEEDS_RIDE : NEEDS_RUN}</p>
            <TopicBody id="unit" />
            <TopicBody id="range" />
          </>
        ) : (
          <>
            <p className="secondary">{gradeGapShown ? ENERGY_CROSS_CHECK : ENERGY_FALLBACK}</p>
            {pick && (
              <>
                <p className="secondary">
                  The 90% range is the spread the model gives for its assumptions. Nine times in
                  ten, the true value falls inside it if those assumptions hold.
                </p>
                <ul className="method__facts">
                  <li>{headlineText(pick.point).range}</li>
                  <li>{headlineBasis(result.comparison, pick.calibrated)}</li>
                  <li>The range does not include every source of error.</li>
                </ul>
              </>
            )}
            <TopicBody id="unit" />
            <TopicBody id="range" />
            <EvidenceDisclosure section="the energy view">
              <RatioChart comparison={result.comparison} />
              <h3>Energy rate by effort length</h3>
              <p className="secondary">
                The app shows each sport in its own units everywhere else.
              </p>
              <CurveChart
                runCurve={result.runCurve}
                rideMetabolicCurve={result.rideMetabolicCurve}
                rideCurve={result.rideCurve}
                units={units}
                activityNames={activityNames(result.activities)}
              />
            </EvidenceDisclosure>
          </>
        )}
      </section>

      <AgeGradingSection gradedSex={gradedSex} />

      <section className="section" aria-labelledby={SECTION_ID.heart}>
        <h2 id={SECTION_ID.heart} tabIndex={-1}>
          Heart-rate check
        </h2>
        <TopicBody id="heart" />
        <ul className="method__facts">
          <li>{referenceDefinition()}</li>
          {reference && <li>{reference}</li>}
          {setAside && <li>{setAside}</li>}
          {hardEfforts && (
            <li>
              Both best efforts reached at least {formatPercent(ALL_OUT_FRACTION)} of each
              sport&rsquo;s reference heart rate. That makes them hard, but does not prove either
              was your hardest.
            </li>
          )}
        </ul>
        <TwentyMinuteEffort />
        {hasResult && (
          <>
            {!weightKnown && rides > 0 && (
              <p className="secondary">
                <WeightPrompt />
              </p>
            )}
            <EvidenceDisclosure section="the heart-rate check">
              <p className="secondary">
                Each dot is a {formatDuration(HR_BLOCK_S)} block of steady effort from your files,
                taken after the first {formatDuration(HR_SKIP_S)} of each activity.{' '}
                {weightKnown
                  ? 'The two lines show how fast heart rate rises with energy rate in each sport.'
                  : 'The line shows how fast heart rate rises with energy rate in running.'}
              </p>
              <HrScatter hr={result.hr} includeRides={weightKnown} />
            </EvidenceDisclosure>
          </>
        )}
      </section>

      {showAccuracy && (
        <section className="section" aria-labelledby={SECTION_ID.accuracy}>
          <h2 id={SECTION_ID.accuracy} tabIndex={-1}>
            Virtual power meter accuracy
          </h2>
          <TopicBody id="virtual" />
          {accuracy !== null &&
            (weightKnown ? (
              <>
                {accuracy.nSegments > 0 && (
                  <p>
                    {`On ${plural(accuracy.nSegments, 'climb')}, estimated power was within ${formatPercent(accuracy.mape)} of your power meter on average.`}
                  </p>
                )}
                <EvidenceDisclosure section="the virtual power meter">
                  <AccuracyScatter accuracy={accuracy} />
                </EvidenceDisclosure>
              </>
            ) : (
              <p className="secondary">{HELD_NOTE}</p>
            ))}
        </section>
      )}

      <CalculatedSection />

      <Methodology topics={HOW_THIS_WORKS} open />
    </div>
  )
}
