import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { useEffect, useRef, useState } from 'react'
import type { ProfileInput } from '@rca/contract'
import './App.css'
import { AccountMenu, Header, PrivacyNote, SyncStatus } from './ui/components'
import { useAccount } from './ui/useAccount'
import { useAnalysis } from './ui/useAnalysis'
import { usePreferences } from './ui/useSettings'
import { FilesToolbar, type ProfilePatch } from './ui/views/FilesToolbar'
import { LandingPitch, LandingView } from './ui/views/LandingView'
import { LibraryNotices } from './ui/views/LibraryNotices'
import { ResultsView } from './ui/views/ResultsView'
import { SavedLibraryCard } from './ui/views/SavedLibraryCard'

const SAMPLE_NOTICE = 'You are looking at simulated sample data. Add your own files to replace it.'

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
  const saveProfile = (next: ProfilePatch) => {
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
  const { result, isSample } = analysis.state
  const signedOut = account.status === 'signed-out'

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

  // Stop, restart and retry unmount their own button when they finish. Once the page has rendered
  // without it, focus moves to the view's heading. Focus still on a control is left where it is.
  const focusWhenDone = useRef(false)
  const [, setFocusTick] = useState(0)
  function runThenFocus(action: () => void) {
    action()
    focusWhenDone.current = true
    setFocusTick((tick) => tick + 1)
  }
  useEffect(() => {
    if (!focusWhenDone.current) return
    focusWhenDone.current = false
    const active = document.activeElement
    if (active !== null && active !== document.body) return
    if (hasResult) document.getElementById('results-heading')?.focus()
    else landingHeading.current?.focus()
  })

  const sampleShown = result !== null && isSample

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
            onDownloadData={analysis.exportData}
          />
        }
      />
      {/* One instance for both views: its live region must stay mounted to announce uploads. */}
      <SyncStatus
        uploading={analysis.uploading}
        issues={analysis.state.syncIssues}
        signedIn={signedIn}
      />
      <LibraryNotices
        analysis={analysis}
        signedIn={signedIn}
        keepFiles={keepFiles}
        fileRetentionAvailable={fileRetentionAvailable}
        libraryUnavailable={account.status === 'unavailable'}
        onRetry={() => runThenFocus(analysis.retryLibrary)}
      />

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
            <button
              type="button"
              className="btn"
              onClick={() => runThenFocus(analysis.retryWorker)}
            >
              Restart analysis
            </button>
          )}
        </div>
      )}

      {analysis.busy && (
        <button type="button" className="btn" onClick={() => runThenFocus(analysis.stop)}>
          Stop current analysis
        </button>
      )}

      <main className={result ? 'app__results' : 'app__intro'}>
        {!result && <LandingPitch headingRef={landingHeading} />}
        {/* Always mounted, so a message put in it is announced. */}
        <p role="status" className={sampleShown ? 'app__sample card' : 'app__quiet'}>
          {sampleShown ? SAMPLE_NOTICE : ''}
        </p>
        <FilesToolbar
          analysis={analysis}
          settings={settings}
          units={units}
          signedIn={signedIn}
          keepFiles={keepFiles}
          fileRetentionAvailable={fileRetentionAvailable}
          onSaveProfile={saveProfile}
        />
        {result ? (
          <ResultsView
            analysis={analysis}
            result={result}
            settings={settings}
            units={units}
            signedOut={signedOut}
            onSignIn={account.signIn}
          />
        ) : (
          <LandingView analysis={analysis} signedOut={signedOut} onSignIn={account.signIn} />
        )}
      </main>

      <SavedLibraryCard analysis={analysis} signedIn={signedIn} />

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
