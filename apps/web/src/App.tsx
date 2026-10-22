import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { useEffect, useRef } from 'react'
import type { Profile, ProfileInput } from '@rca/contract'
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
  pickHeadline,
} from './ui/components'
import { useAccount } from './ui/useAccount'
import { useAnalysis } from './ui/useAnalysis'
import { usePreferences } from './ui/useSettings'

function profileInput(profile: Profile): ProfileInput {
  return {
    massKg: profile.massKg,
    bikeMassKg: profile.bikeMassKg,
    units: profile.units,
    keepFiles: profile.keepFiles,
  }
}

export function App() {
  const [preferences, setPreferences] = usePreferences()
  const account = useAccount()
  const profile = account.status === 'signed-in' ? (account.me?.profile ?? null) : null
  const signedIn = profile !== null
  const fileRetentionAvailable = account.me?.fileRetentionAvailable !== false
  const userId = account.me?.user.id ?? null
  const profileEditRef = useRef<{ userId: string | null; input: ProfileInput | null }>({
    userId,
    input: profile ? profileInput(profile) : null,
  })
  const profileSavedRef = useRef<{ userId: string | null; input: ProfileInput | null }>({
    userId,
    input: profile ? profileInput(profile) : null,
  })
  useEffect(() => {
    if (profileEditRef.current.userId !== userId) {
      const input = profile ? profileInput(profile) : null
      profileEditRef.current = { userId, input }
      profileSavedRef.current = { userId, input }
    } else if (profile && profileEditRef.current.input === null) {
      const input = profileInput(profile)
      profileEditRef.current.input = input
      profileSavedRef.current = { userId, input }
    } else if (profile) {
      profileSavedRef.current = { userId, input: profileInput(profile) }
    }
  }, [profile, userId])

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
      const current = profileEditRef.current.input ?? profileInput(profile)
      const input = {
        massKg: next.settings?.massKg ?? current.massKg,
        bikeMassKg: next.settings?.bikeMassKg ?? current.bikeMassKg,
        units: next.units ?? current.units,
        keepFiles: next.keepFiles ?? current.keepFiles,
      }
      profileEditRef.current.input = input
      const editUserId = profileEditRef.current.userId
      void account
        .updateProfile(input)
        .then(() => {
          if (profileSavedRef.current.userId === editUserId) {
            profileSavedRef.current.input = input
          }
        })
        .catch(() => {
          if (
            profileEditRef.current.userId === editUserId &&
            profileEditRef.current.input === input
          ) {
            profileEditRef.current.input = profileSavedRef.current.input
          }
        })
    } else {
      setPreferences({
        settings: next.settings ?? preferences.settings,
        units: next.units ?? preferences.units,
      })
    }
  }

  const analysis = useAnalysis(settings, account)
  const { result, rejected, unsupportedFiles, isSample, totalActivities, rangeDays } =
    analysis.state
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
        failures={analysis.state.syncFailures}
        storageBudgetExceeded={analysis.storageBudgetExceeded}
        signedIn={signedIn}
      />
      {signedIn && analysis.state.outdatedActivities > 0 && (
        <section className="card" aria-label="Saved activity updates">
          <p role="status">
            {analysis.state.outdatedActivities} saved{' '}
            {analysis.state.outdatedActivities === 1 ? 'activity uses' : 'activities use'} an older
            analysis model and {analysis.state.outdatedActivities === 1 ? 'is' : 'are'} excluded
            from these results.
          </p>
          {analysis.rebuildNotice && <p role="status">{analysis.rebuildNotice}</p>}
          {!fileRetentionAvailable && (
            <p>
              Original file storage is unavailable on this deployment, so saved activities cannot be
              rebuilt from the library. Import the original FIT files to update them; existing saved
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

      {account.error && account.status !== 'unavailable' && (
        <p className="app__error card" role="alert">
          {account.error}
        </p>
      )}

      {analysis.error && (
        <div className="app__error card" role="alert">
          <p>Something went wrong: {analysis.error}</p>
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

      {!result && (
        <main className="app__intro">
          <section className="app__pitch">
            <h1 ref={landingHeading} tabIndex={-1}>
              How do your running and cycling energy estimates compare?
            </h1>
            <p className="secondary">
              Watts on the bike and pace on the run cannot be compared directly. This tool converts
              both into the energy your body burns per kilogram, then compares the estimates with a
              range that reflects the model assumptions.
            </p>
          </section>
          <Dropzone
            onFiles={analysis.addFiles}
            onSample={analysis.loadSample}
            busy={analysis.busy}
            progress={analysis.progress}
          />
          <RejectedFiles rejected={rejected} unsupportedFiles={unsupportedFiles} />
          {account.status === 'signed-out' && <SignInCallout onSignIn={account.signIn} />}
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
                The model assumes heart rate responds similarly to energy use in both sports. When
                the data support it, fitted slopes adjust the energy estimates; otherwise, the
                population-based range is kept.
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
              onChange={(next) => saveProfile({ settings: next })}
            />
            {signedIn && (
              <label className="app__keep-files">
                <input
                  type="checkbox"
                  checked={keepFiles}
                  disabled={!fileRetentionAvailable}
                  onChange={(event) => saveProfile({ keepFiles: event.target.checked })}
                />
                Keep original files in my library
              </label>
            )}
            {signedIn && !fileRetentionAvailable && (
              <p role="status">
                Original file storage is unavailable on this deployment. Your saved preference is
                preserved; new imports save summaries only and original files stay on this device.
                Existing saved originals are not deleted.
              </p>
            )}
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
          </section>
          {account.status === 'signed-out' && !isSample && (
            <SignInCallout onSignIn={account.signIn} />
          )}
          <RejectedFiles rejected={rejected} unsupportedFiles={unsupportedFiles} />

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
        <PrivacyNote
          signedIn={signedIn}
          keepFiles={keepFiles}
          fileRetentionAvailable={fileRetentionAvailable}
        />
      </footer>
    </div>
  )
}
