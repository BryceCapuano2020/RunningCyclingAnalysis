import { weeksWithValue } from '@rca/core/digest/trendPoints'
import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { AccuracyScatter, CurveChart, HrScatter, RatioChart, TrendChart } from '../charts'
import {
  ActivitiesTable,
  EquivalenceTable,
  Headline,
  Methodology,
  ShareImageButton,
  SignInCallout,
  pickHeadline,
} from '../components'
import type { AnalysisController } from '../useAnalysis'
import { ImportRejections } from './ImportRejections'

export interface ResultsViewProps {
  analysis: AnalysisController
  result: NonNullable<AnalysisController['state']['result']>
  settings: AthleteSettings
  units: UnitSystem
  signedOut: boolean
  onSignIn: () => void
}

/** The analysis page, shown once there is a result. */
export function ResultsView({
  analysis,
  result,
  settings,
  units,
  signedOut,
  onSignIn,
}: ResultsViewProps) {
  const { isSample, rangeDays, trend } = analysis.state
  const headlineDuration = pickHeadline(result.comparison)?.point.durationS
  const headlineEffort = result.effort.find((e) => e.durationS === headlineDuration) ?? null

  return (
    <>
      {signedOut && !isSample && <SignInCallout onSignIn={onSignIn} />}
      <ImportRejections analysis={analysis} />

      <section className="card">
        <Headline result={result} units={units} massKg={settings.massKg} effort={headlineEffort} />
        <ShareImageButton
          result={result}
          settings={settings}
          units={units}
          rangeDays={rangeDays}
          isSample={isSample}
          effort={headlineEffort}
          disabled={analysis.busy}
        />
      </section>

      <section className="card">
        <h2>Best efforts in one unit</h2>
        <p>
          The highest estimated energy rate per kilogram for each length of effort. Where the lines
          cross, the two sports are equal.
        </p>
        <CurveChart
          runCurve={result.runCurve}
          rideMetabolicCurve={result.rideMetabolicCurve}
          rideCurve={result.rideCurve}
          units={units}
          activityNames={Object.fromEntries(result.activities.map((a) => [a.id, a.name]))}
        />
      </section>

      {weeksWithValue(trend) >= 2 && (
        <section className="card">
          <h2>Fitness over time</h2>
          <p>Your best estimated energy rate over 20 min in the previous 6 weeks, each week.</p>
          <TrendChart points={trend} />
        </section>
      )}

      <div className="grid-2">
        <section className="card">
          <h2>Running compared with cycling</h2>
          <p>How far your running sits above or below your cycling at each length of effort.</p>
          <RatioChart comparison={result.comparison} />
        </section>
        <section className="card">
          <h2>What your cycling is worth on foot</h2>
          <p>
            Your best cycling efforts, and the flat running pace estimated to use the same energy
            (90% model range).
          </p>
          <EquivalenceTable equivalents={result.equivalents} units={units} />
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Heart-rate check</h2>
          <p>
            Each dot is five steady minutes. If the model is right for you, the two lines rise at
            the same rate.
          </p>
          <HrScatter hr={result.hr} />
        </section>
        {result.virtualAccuracy && (
          <section className="card">
            <h2>Virtual power meter accuracy</h2>
            <p>
              Power estimated from speed, gradient and weight on climbs, tuned on your other
              power-meter rides and scored on each ride it was not tuned on.
            </p>
            <AccuracyScatter accuracy={result.virtualAccuracy} />
          </section>
        )}
      </div>

      <section className="card">
        <h2>Activities</h2>
        <ActivitiesTable activities={result.activities} units={units} />
      </section>

      <Methodology />
    </>
  )
}
