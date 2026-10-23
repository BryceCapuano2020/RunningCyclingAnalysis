import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { useEffect, useRef } from 'react'
import type { ProfileInput } from '@rca/contract'
import './App.css'
import { AccuracyScatter, CurveChart, HrScatter, RatioChart } from './ui/charts'
import {
  AccountMenu,
  ActivitiesTable,
  Dropzone,
  EquivalenceTable,
  Header,
  Headline,
  Methodology,
  PrivacyNote,
  RangePicker,
  RejectedFiles,
  SettingsBar,
  SignInCallout,
  SyncStatus,
  SavedLibrary,
  pickHeadline,
} from './ui/components'
import { useAccount } from './ui/useAccount'
import { useAnalysis } from './ui/useAnalysis'
import { usePreferences } from './ui/useSettings'
import { plural } from './ui/components/plural'

/** Note for saved activities left out of the analysis because another file holds their workout. */
function hiddenCopiesText(count: number): string {
  const copies = count === 1 ? 'is a copy' : 'are copies'
  const counted = count === 1 ? 'is' : 'are'
  return (
    `${plural(count, 'saved activity', 'saved activities')} ${copies} of the same workout ` +
    `from another file and ${counted} not counted twice.`
  )
}

export function App() {
  const [preferences, setPreferences] = usePreferences()
  const account = useAccount()
  const profile = account.status === 'signed-in' ? (account.me?.profile ?? null) : null
  const signedIn = profile !== null
  const fileRetentionAvailable = account.me?.fileRetentionAvailable !== false
  // Signed in, the saved profile is the source of truth; signed out, local preferences are.
  const settings: AthleteSettings = profile
    ? { massKg: profile.massKg, bikeMassKg: profile.bikeMassKg }
    : preferences.settings
  const units: UnitSystem = profile ? profile.units : preferences.units
  const keepFiles = profile?.keepFiles ?? false
  const saveProfile = (
    next: Partial<{ settings: AthleteSettings; units: UnitSystem; keepFiles: boolean }>,
  ) => {
    if (profile) {
      // Only the fields the user changed are sent. The account merges them onto the latest saved
      // profile, so a change made in another tab is not reverted.
      const patch: Partial<ProfileInput> = {}
      if (next.settings) {
        patch.massKg = next.settings.massKg
        patch.bikeMassKg = next.settings.bikeMassKg
      }
      if (next.units !== undefined) patch.units = next.units
      if (next.keepFiles !== undefined) patch.keepFiles = next.keepFiles
      // The failure is shown by the account's error message.
      void account.updateProfile(patch).catch(() => undefined)
    } else {
      setPreferences({
        settings: next.settings ?? preferences.settings,
        units: next.units ?? preferences.units,
      })
    }
  }

  const analysis = useAnalysis(settings, account)
  const fileRetentionControls = signedIn && (
    <>
      <label className="app__keep-files">
        <input
          type="checkbox"
          checked={keepFiles}
          disabled={!fileRetentionAvailable}
          aria-describedby="file-retention-help"
          onChange={(event) => saveProfile({ keepFiles: event.target.checked })}
        />
        Keep original files in my library
      </label>
      <p id="file-retention-help" className="app__retention-help muted">
        Originals let you rebuild saved analyses later. Turning this off deletes saved originals;
        activity summaries remain.
      </p>
      {!fileRetentionAvailable && (
        <p role="status">
          Original file storage is unavailable on this deployment. Your saved preference is
          preserved; new imports save summaries only and original files stay on this device.
          Existing saved originals are not deleted.
        </p>
      )}
    </>
  )
  const { result, rejected, unsupportedFiles, isSample, totalActivities, rangeDays } =
    analysis.state
  const originalsMissing = analysis.missingOriginals
  const missingText =
    originalsMissing === 1
      ? '1 activity is missing its original file. Re-import it to restore the original.'
      : `${originalsMissing} activities are missing their original file. Re-import them to restore the originals.`
  const headlineDuration = result ? pickHeadline(result.comparison)?.point.durationS : undefined
  const headlineEffort = result?.effort.find((e) => e.durationS === headlineDuration) ?? null

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
        onUnitsChange={(next) => saveProfile({ units: next })}
        actions={
          <AccountMenu
            status={account.status}
            me={account.me}
            onSignIn={account.signIn}
            onSignOut={() => void account.signOut().catch(() => undefined)}
            onDeleteAccount={account.deleteAccount}
          />
        }
      />
      {/* One instance for both views: its live region must stay mounted to announce uploads. */}
      <SyncStatus
        uploading={analysis.uploading}
        issues={analysis.state.syncIssues}
        signedIn={signedIn}
      />
      {account.status === 'unavailable' && (
        <p className="card" role="status">
          Your library is unavailable right now. Analysis still runs in your browser and nothing is
          being saved.
        </p>
      )}
      {signedIn && analysis.libraryStatus === 'failed' && (
        <section className="card app__error" aria-label="Library">
          <p role="alert">Your library could not be loaded.</p>
          <button type="button" className="btn" onClick={analysis.retryLibrary}>
            Retry
          </button>
        </section>
      )}
      {signedIn && keepFiles && fileRetentionAvailable && originalsMissing > 0 && (
        <section className="card" aria-label="Missing original files">
          <p role="status">{missingText}</p>
        </section>
      )}
      {signedIn && analysis.state.outdatedActivities > 0 && (
        <section className="card" aria-label="Saved activity updates">
          <p role="status">
            {analysis.state.outdatedActivities} saved{' '}
            {analysis.state.outdatedActivities === 1 ? 'activity uses' : 'activities use'} an older
            analysis model and {analysis.state.outdatedActivities === 1 ? 'is' : 'are'} excluded
            from these results.
          </p>
          {!fileRetentionAvailable && (
            <p>
              Original file storage is unavailable on this deployment, so saved activities cannot be
              rebuilt from the library. Import the original files to update them; existing saved
              originals are not deleted.
            </p>
          )}
          <button
            type="button"
            className="btn"
            onClick={analysis.rebuildSavedActivities}
            disabled={analysis.busy || !fileRetentionAvailable}
          >
            {analysis.busy ? 'Rebuilding saved activities…' : 'Rebuild saved activities'}
          </button>
        </section>
      )}
      {/* Always mounted, so the outcome of a rebuild is announced and stays after the card above unmounts. */}
      <div role="status">{analysis.rebuildNotice}</div>
      {analysis.state.incompatibleActivities > 0 && (
        <section className="card" aria-label="Incompatible saved activities">
          <p role="status">
            {analysis.state.incompatibleActivities} saved{' '}
            {analysis.state.incompatibleActivities === 1 ? 'activity was' : 'activities were'}{' '}
            created with a newer app version and{' '}
            {analysis.state.incompatibleActivities === 1 ? 'is' : 'are'} excluded from analysis.
            {' Use a compatible app version to analyze them.'}
          </p>
        </section>
      )}
      {analysis.state.hiddenDuplicates > 0 && (
        <p className="secondary">{hiddenCopiesText(analysis.state.hiddenDuplicates)}</p>
      )}

      {account.error && account.status !== 'unavailable' && (
        <p className="app__error card" role="alert">
          {account.error}
        </p>
      )}

      {analysis.error && (
        <div className="app__error card" role="alert">
          {analysis.errorIssue === 'daily-limit' ? (
            <p>{analysis.error}</p>
          ) : (
            <p>Something went wrong: {analysis.error}</p>
          )}
          {analysis.workerStopped && (
            <button type="button" className="btn" onClick={analysis.retryWorker}>
              Restart analysis
            </button>
          )}
        </div>
      )}

      {analysis.busy && (
        <button type="button" className="btn" onClick={analysis.stop}>
          Stop current analysis
        </button>
      )}

      <main className={result ? 'app__results' : 'app__intro'}>
        {!result && (
          <section className="app__pitch">
            <h1 ref={landingHeading} tabIndex={-1}>
              How do your running and cycling energy estimates compare?
            </h1>
            <p className="secondary">
              Watts on the bike and pace on the run cannot be compared directly. This tool converts
              both into estimated energy use per kilogram, then compares the estimates with a range
              that reflects the model assumptions.
            </p>
          </section>
        )}
        {result && isSample && (
          <p className="app__sample card" role="status">
            You are looking at simulated sample data. Add your own files to replace it.
          </p>
        )}
        <section
          className={result ? 'card app__toolbar' : undefined}
          aria-label="Files and settings"
        >
          {!result && fileRetentionControls}
          <Dropzone
            compact={result !== null}
            onFiles={analysis.addFiles}
            onSample={analysis.loadSample}
            busy={analysis.busy}
            waiting={analysis.waitingReason}
            progress={analysis.progress}
            signedIn={signedIn}
            outcome={analysis.importOutcome}
          />
          {result && (
            <>
              <SettingsBar
                settings={settings}
                units={units}
                onChange={(next) => saveProfile({ settings: next })}
              />
              {fileRetentionControls}
              <RangePicker
                rangeDays={rangeDays}
                onChange={analysis.setRange}
                shown={result.activities.length}
                total={totalActivities}
              />
              {!signedIn && (
                <button
                  type="button"
                  className="btn"
                  onClick={analysis.clear}
                  disabled={analysis.busy}
                >
                  Start over
                </button>
              )}
            </>
          )}
        </section>
        {!result && (
          <>
            <RejectedFiles
              rejected={rejected}
              unsupportedFiles={unsupportedFiles}
              duplicates={analysis.importOutcome?.duplicates ?? []}
            />
            {account.status === 'signed-out' && <SignInCallout onSignIn={account.signIn} />}
            <ol className="app__steps">
              <li>
                <h3>1. Add your files</h3>
                <p className="secondary">
                  FIT, GPX or TCX files from a Garmin, Wahoo or similar device, or the zip from
                  Strava&rsquo;s account export.
                </p>
              </li>
              <li>
                <h3>2. Both sports become one unit</h3>
                <p className="secondary">
                  Cycling power and running speed on any gradient are converted to metabolic watts
                  per kilogram.
                </p>
              </li>
              <li>
                <h3>3. Your heart rate checks the maths</h3>
                <p className="secondary">
                  The model assumes heart rate responds similarly to energy use in both sports. When
                  the data support it, fitted slopes adjust the energy estimates; otherwise, the
                  population-based range is kept.
                </p>
              </li>
            </ol>
            <Methodology />
          </>
        )}
        {result && (
          <>
            {account.status === 'signed-out' && !isSample && (
              <SignInCallout onSignIn={account.signIn} />
            )}
            <RejectedFiles
              rejected={rejected}
              unsupportedFiles={unsupportedFiles}
              duplicates={analysis.importOutcome?.duplicates ?? []}
            />

            <section className="card">
              <Headline
                result={result}
                units={units}
                massKg={settings.massKg}
                effort={headlineEffort}
              />
            </section>

            <section className="card">
              <h2>Best efforts in one unit</h2>
              <p>
                The highest estimated energy rate per kilogram for each length of effort. Where the
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
                <p>
                  How far your running sits above or below your cycling at each length of effort.
                </p>
                <RatioChart comparison={result.comparison} />
              </section>
              <section className="card">
                <h2>What your cycling is worth on foot</h2>
                <p>
                  Your best cycling efforts, and the flat running pace estimated to use the same
                  energy (90% model range).
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
        )}
      </main>

      {signedIn && analysis.libraryStatus === 'loaded' && (
        <section className="card" aria-label="Saved library">
          <h2>Saved library</h2>
          <SavedLibrary
            activities={analysis.savedActivities}
            busy={analysis.busy || analysis.libraryAction !== null}
            onDelete={analysis.deleteActivity}
            status={analysis.libraryNotice}
            error={analysis.libraryError}
            unreadable={analysis.libraryUnreadable}
          />
        </section>
      )}

      <footer className="app__footer muted">
        <PrivacyNote
          signedIn={signedIn}
          keepFiles={keepFiles}
          fileRetentionAvailable={fileRetentionAvailable}
        />
        <p>
          <a href="/privacy">Privacy</a>
        </p>
      </footer>
    </div>
  )
}
