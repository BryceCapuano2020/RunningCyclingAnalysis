import { ALL_OUT_FRACTION } from '@rca/core/effort'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { UnitSystem } from '@rca/core/units'
import { formatPercent } from '@rca/core/units'
import { AccuracyScatter, CurveChart, HrScatter, RatioChart } from '../charts'
import { Methodology, pickHeadline } from '../components'
import {
  COMPARISON_DISCLAIMER,
  hardEffortsOnFile,
  headlineBasis,
  headlineText,
  referenceText,
} from '../components/headlineText'
import { plural } from '../components/plural'
import { gradedSexOf, headlineGrades } from '../grades'
import type { AgeProfile } from '../grades'
import { PAGE_HEADING_ID } from './pageHeading'
import { AgeGradingSection } from './AgeGradingSection'
import { activityNames, countSport } from '../records'

export interface MethodPageProps {
  result: AnalysisResult
  units: UnitSystem
  /** The year of birth and sex for the grades, or null while either is missing. */
  profile: AgeProfile | null
}

/** The model's own checks, one level below the answers: How sure is this? */
export function MethodPage({ result, units, profile }: MethodPageProps) {
  const runs = countSport(result.activities, 'run')
  const rides = countSport(result.activities, 'ride')
  const pick = pickHeadline(result.comparison)
  const effort = result.effort.find((e) => e.durationS === pick?.point.durationS) ?? null
  const reference = referenceText(result)
  const accuracy = result.virtualAccuracy
  const headline = profile === null ? null : headlineGrades(result, profile)
  const gradedSex = gradedSexOf(headline, profile)

  return (
    <div className="page-stack">
      <div className="page-head">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          How sure is this?
        </h1>
      </div>
      <p className="lede secondary">
        {`Every number in the app is an estimate from ${plural(runs, 'run')} and ${plural(rides, 'ride')} in this period. These are the checks behind them.`}
      </p>

      <section className="section" aria-labelledby="method-ratio">
        <h2 id="method-ratio">Running compared with cycling</h2>
        <p className="secondary">
          Pace and power are converted to the energy they cost per kilogram, so the two sports can
          be compared on one scale. The chart shows how far your running sits above or below your
          cycling at each length of effort, with the model&rsquo;s 90% range.
        </p>
        {pick && (
          <ul className="method__facts">
            <li>{headlineText(pick.point).range}</li>
            <li>{headlineBasis(result.comparison, pick.calibrated)}</li>
            {reference && <li>{reference}</li>}
            {hardEffortsOnFile(effort) && (
              <li>
                Both best efforts reached at least {formatPercent(ALL_OUT_FRACTION)} of each
                sport&rsquo;s heart-rate reference. That makes them hard, but does not prove either
                was all-out.
              </li>
            )}
            <li>{`${COMPARISON_DISCLAIMER} The range does not include every source of error.`}</li>
          </ul>
        )}
        <RatioChart comparison={result.comparison} />
      </section>

      <section className="section" aria-labelledby="method-scale">
        <h2 id="method-scale">Both sports on one scale</h2>
        <p className="secondary">
          Energy rate is the gross metabolic power a sport costs, per kilogram of body mass. Pace
          and power are converted to it at the model&rsquo;s prior-mean economy, so the two sports
          share one axis. The app shows each sport in its own units everywhere else.
        </p>
        <CurveChart
          runCurve={result.runCurve}
          rideMetabolicCurve={result.rideMetabolicCurve}
          rideCurve={result.rideCurve}
          units={units}
          activityNames={activityNames(result.activities)}
        />
      </section>

      <section className="section" aria-labelledby="method-hr">
        <h2 id="method-hr">Heart-rate check</h2>
        <p className="secondary">
          Each dot is five steady minutes. If the model is right for you, the two lines rise at the
          same rate.
        </p>
        <HrScatter hr={result.hr} />
      </section>

      {accuracy && (
        <section className="section" aria-labelledby="method-accuracy">
          <h2 id="method-accuracy">Virtual power meter accuracy</h2>
          <p className="secondary">
            Rides without a power meter are priced from speed, gradient and weight. The estimate is
            tuned on your other power-meter rides and scored on each ride it was not tuned on.
          </p>
          {accuracy.nSegments > 0 && (
            <p>
              {`On ${plural(accuracy.nSegments, 'climb')}, estimated power was within ${formatPercent(accuracy.mape)} of your power meter on average.`}
            </p>
          )}
          <AccuracyScatter accuracy={accuracy} />
        </section>
      )}

      <AgeGradingSection gradedSex={gradedSex} />

      <Methodology />
    </div>
  )
}
