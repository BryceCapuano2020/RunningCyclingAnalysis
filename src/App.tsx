import { useEffect, useRef } from 'react'
import './App.css'
import { AccuracyScatter, CurveChart, HrScatter, RatioChart } from './ui/charts'
import {
  ActivitiesTable,
  Dropzone,
  EquivalenceTable,
  Header,
  Headline,
  Methodology,
  RejectedFiles,
  SettingsBar,
} from './ui/components'
import { useAnalysis } from './ui/useAnalysis'
import { usePreferences } from './ui/useSettings'

export function App() {
  const [preferences, setPreferences] = usePreferences()
  const { settings, units } = preferences
  const analysis = useAnalysis(settings)
  const { result, rejected, unsupportedFiles, isSample } = analysis.state

  // Swapping between the landing and results views unmounts whatever had focus,
  // so send focus to the new view's heading.
  const hasResult = result !== null
  const previousHasResult = useRef(hasResult)
  const landingHeading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (previousHasResult.current === hasResult) return
    previousHasResult.current = hasResult
    if (hasResult) document.getElementById('results-heading')?.focus()
    else landingHeading.current?.focus()
  }, [hasResult])

  return (
    <div className="page">
      <Header
        units={units}
        onUnitsChange={(next) => setPreferences({ ...preferences, units: next })}
      />

      {analysis.error && (
        <p className="app__error card" role="alert">
          Something went wrong: {analysis.error}
        </p>
      )}

      {!result && (
        <main className="app__intro">
          <section className="app__pitch">
            <h1 ref={landingHeading} tabIndex={-1}>
              Are you a stronger runner or cyclist?
            </h1>
            <p className="secondary">
              Watts on the bike and pace on the run cannot be compared directly. This tool converts
              both into the energy your body burns per kilogram, then tells you which engine is
              bigger and how sure it can be.
            </p>
          </section>
          <Dropzone
            onFiles={analysis.addFiles}
            onSample={analysis.loadSample}
            busy={analysis.busy}
            progress={analysis.progress}
          />
          <RejectedFiles rejected={rejected} unsupportedFiles={unsupportedFiles} />
          <ol className="app__steps">
            <li>
              <h3>1. Add your files</h3>
              <p className="secondary">
                FIT files from a Garmin, Wahoo or similar device, or the zip from Strava&rsquo;s
                account export.
              </p>
            </li>
            <li>
              <h3>2. Both sports become one unit</h3>
              <p className="secondary">
                Cycling power and running speed on any gradient are converted to metabolic watts per
                kilogram.
              </p>
            </li>
            <li>
              <h3>3. Your heart rate checks the maths</h3>
              <p className="secondary">
                Heart rate is an independent measure of effort, so it corrects the estimate for your
                body and narrows the range.
              </p>
            </li>
          </ol>
          <Methodology />
        </main>
      )}

      {result && (
        <main className="app__results">
          {isSample && (
            <p className="app__sample card" role="status">
              You are looking at simulated sample data. Add your own files to replace it.
            </p>
          )}
          <section className="card app__toolbar" aria-label="Files and settings">
            <Dropzone
              compact
              onFiles={analysis.addFiles}
              onSample={analysis.loadSample}
              busy={analysis.busy}
              progress={analysis.progress}
            />
            <SettingsBar
              settings={settings}
              units={units}
              onChange={(next) => setPreferences({ ...preferences, settings: next })}
            />
            <button type="button" className="btn" onClick={analysis.clear} disabled={analysis.busy}>
              Start over
            </button>
          </section>
          <RejectedFiles rejected={rejected} unsupportedFiles={unsupportedFiles} />

          <section className="card">
            <Headline result={result} units={units} massKg={settings.massKg} />
          </section>

          <section className="card">
            <h2>Best efforts in one unit</h2>
            <p>
              The most energy you have burned per kilogram for each length of effort. Where the
              lines cross, the two sports are equal.
            </p>
            <CurveChart
              runCurve={result.runCurve}
              rideMetabolicCurve={result.rideMetabolicCurve}
              rideCurve={result.rideCurve}
              units={units}
              activityNames={Object.fromEntries(result.activities.map((a) => [a.id, a.name]))}
            />
          </section>

          <div className="grid-2">
            <section className="card">
              <h2>Running compared with cycling</h2>
              <p>How far your running sits above or below your cycling at each length of effort.</p>
              <RatioChart comparison={result.comparison} />
            </section>
            <section className="card">
              <h2>What your cycling is worth on foot</h2>
              <p>
                Your best cycling efforts, and the flat running pace that burns the same energy.
              </p>
              <EquivalenceTable equivalents={result.equivalents} units={units} />
            </section>
          </div>

          <div className="grid-2">
            <section className="card">
              <h2>Heart-rate check</h2>
              <p>
                Each dot is five steady minutes. If the model is right for you, the two lines rise
                at the same rate.
              </p>
              <HrScatter hr={result.hr} />
            </section>
            {result.virtualAccuracy && (
              <section className="card">
                <h2>Virtual power meter accuracy</h2>
                <p>
                  Power estimated from speed, gradient and weight on climbs, tested against your
                  real power meter on rides it was not tuned on.
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
        </main>
      )}

      <footer className="app__footer muted">
        Nothing is uploaded. Files are read and analysed in your browser only.
      </footer>
    </div>
  )
}
