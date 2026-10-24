import { useEffect, useRef, useState } from 'react'
import './App.css'
import { AccountMenu, Header, PrivacyNote } from './ui/components'
import { AddFilesButton } from './ui/components/AddFilesButton'
import { AppNotices } from './ui/components/AppNotices'
import { ImportStatus } from './ui/components/ImportStatus'
import { SetupDialog } from './ui/components/SetupDialog'
import { LandingPage } from './ui/pages/LandingPage'
import { WAITING_FOR_ACCOUNT } from './ui/analysis/copy'
import { listedMoves } from './ui/analysis/whatMoved'
import { focusPageHeading } from './ui/pages/pageHeading'
import { ProfilePage } from './ui/pages/ProfilePage'
import { ResultPage } from './ui/pages/ResultPage'
import type { Route } from './ui/route'
import { hrefFor, useRoute } from './ui/route'
import { useAccount } from './ui/useAccount'
import { useAnalysis } from './ui/useAnalysis'
import { usePreferences } from './ui/useSettings'
import { useSetup } from './ui/useSetup'
import { applyPatch, athleteValuesOf, profileFields } from './ui/profilePatch'
import type { AthleteValues, ProfilePatch } from './ui/profilePatch'

/** A string that changes whenever a different page is on screen. */
function pageKey(route: Route, hasResult: boolean): string {
  if (route.page === 'profile') return 'profile'
  if (!hasResult) return 'landing'
  return route.page === 'activity' ? `activity:${route.id}` : route.page
}

/**
 * Whether focus was lost with the page that went away. Focus that is still on a control outside
 * the page, such as the header, is where the user put it and is left alone.
 */
function focusWasLost(): boolean {
  const active = document.activeElement
  if (active === null || active === document.body || !active.isConnected) return true
  return document.querySelector('main')?.contains(active) ?? false
}

export function App() {
  const [preferences, setPreferences] = usePreferences()
  const account = useAccount()
  const route = useRoute()
  const profile = account.status === 'signed-in' ? (account.me?.profile ?? null) : null
  const signedIn = profile !== null
  const fileRetentionAvailable = account.me?.fileRetentionAvailable !== false
  // Signed in, the saved profile is the source of truth; signed out, local preferences are.
  const athleteValues: AthleteValues = profile
    ? athleteValuesOf(profile)
    : {
        settings: preferences.settings,
        units: preferences.units,
        birthYear: preferences.birthYear,
        sex: preferences.sex,
      }
  const { settings, units } = athleteValues
  const keepFiles = profile?.keepFiles ?? false

  // Keeps the saved preferences showing the athlete's values, so a later sign-out shows them.
  const keepInPreferences = (values: AthleteValues, setupDone?: boolean) =>
    setPreferences({ ...values, setupDone: setupDone ?? preferences.setupDone })

  // Saves a change to the athlete. Signed in, the account stores it first, and the preferences then
  // take the values it stored; signed out, the preferences are the only copy. A refused change
  // rejects and is not kept anywhere on this device.
  const saveAnswers = async (next: ProfilePatch) => {
    const fields = profileFields(next)
    if (profile === null || Object.keys(fields).length === 0) {
      keepInPreferences(applyPatch(athleteValues, next), next.setupDone)
      return
    }
    keepInPreferences(athleteValuesOf(await account.updateProfile(fields)), next.setupDone)
  }
  // A refused change is shown by the account's error message.
  const saveProfile = (next: ProfilePatch) => {
    void saveAnswers(next).catch(() => undefined)
  }

  const analysis = useAnalysis(settings, account)
  // Called after useAnalysis, so its settings are in place before held files are sent.
  const setup = useSetup({
    status: account.status,
    workerStopped: analysis.workerStopped,
    preferencesDone: preferences.setupDone,
    addFiles: analysis.addFiles,
    save: saveAnswers,
  })
  // Files held while the account loads show as waiting: the import cannot start until it is known.
  const accountWait = account.status === 'loading' && setup.held > 0
  const hasResult = analysis.state.result !== null
  // What the last import moved in the athlete's numbers, for the summary and the sync status.
  const moved = listedMoves(analysis.importChange, settings, units)
  const key = pageKey(route, hasResult)

  // A new page replaces the old one, so focus moves to the new page's heading and the page shows
  // from the top. A link the user followed always moves them; a page that changes by itself, such
  // as a library that loads, only takes focus that was lost with the old page. The first render
  // keeps the browser's own focus and scroll.
  const previousKey = useRef(key)
  const previousHash = useRef(window.location.hash)
  useEffect(() => {
    if (previousKey.current === key) return
    previousKey.current = key
    const followed = previousHash.current !== window.location.hash
    previousHash.current = window.location.hash
    if (!followed && !focusWasLost()) return
    window.scrollTo(0, 0)
    focusPageHeading()
  }, [key])

  // Start over clears the analysis in the worker. The landing page shows once it has, so the old
  // result never flashes on the way. Leaving Profile first cancels the move; it replaces the
  // Profile history entry rather than adding one.
  const startingOver = useRef(false)
  const startOver = () => {
    startingOver.current = true
    analysis.clear()
  }
  useEffect(() => {
    if (!startingOver.current) return
    if (route.page !== 'profile') startingOver.current = false
    else if (!hasResult) {
      startingOver.current = false
      window.location.replace(hrefFor({ page: 'balance' }))
    }
  }, [hasResult, route.page])

  // Once the account is gone, its Profile page has nothing left to show, so the visitor goes to the
  // landing page. A failed delete rejects before this line, and the dialog stays open.
  const deleteAccount = async () => {
    await account.deleteAccount()
    window.location.replace(hrefFor({ page: 'balance' }))
  }

  // Stop, restart and retry unmount their own button when they finish. Once that button has gone
  // and focus went with it, focus moves to the page's heading. Focus the user has moved elsewhere
  // is left where it is.
  const focusAfter = useRef<{ control: Element | null } | null>(null)
  const [, setFocusTick] = useState(0)
  // The control is passed by the caller because Safari and Firefox do not focus a clicked button.
  function runThenFocus(action: () => void, control?: Element) {
    const active = document.activeElement
    action()
    focusAfter.current = { control: control ?? (active === document.body ? null : active) }
    setFocusTick((tick) => tick + 1)
  }
  useEffect(() => {
    const pending = focusAfter.current
    if (pending === null) return
    const active = document.activeElement
    // The button that ran the action is still there: wait for it to go.
    if (pending.control?.isConnected) return
    focusAfter.current = null
    if (active !== null && active !== document.body && active.isConnected) return
    focusPageHeading()
  })

  const accountsAvailable = account.status !== 'unavailable'

  return (
    <div className="page">
      <Header
        route={route}
        showTabs={hasResult}
        addFiles={<AddFilesButton onFiles={setup.requestImport} primary={hasResult || signedIn} />}
        account={
          <AccountMenu
            status={account.status}
            me={account.me}
            onSignIn={account.signIn}
            onSignOut={() => void account.signOut().catch(() => undefined)}
          />
        }
      />
      {/* Always mounted, under the header: file drops anywhere, progress and announcements. */}
      <ImportStatus
        onFiles={setup.requestImport}
        busy={analysis.busy || accountWait}
        progress={analysis.progress}
        waiting={analysis.waitingReason ?? (accountWait ? WAITING_FOR_ACCOUNT : null)}
        signedIn={signedIn}
        outcome={analysis.importOutcome}
        moved={moved}
        onDismiss={analysis.dismissSummary}
        atBalance={route.page === 'balance'}
      />

      <AppNotices
        analysis={analysis}
        signedIn={signedIn}
        moved={moved.length > 0}
        keepFiles={keepFiles}
        fileRetentionAvailable={fileRetentionAvailable}
        accountsUnavailable={!accountsAvailable}
        accountError={account.error}
        runThenFocus={runThenFocus}
      />

      <main className="app__main">
        {route.page === 'profile' ? (
          <ProfilePage
            analysis={analysis}
            settings={settings}
            units={units}
            birthYear={athleteValues.birthYear}
            sex={athleteValues.sex}
            signedIn={signedIn}
            accountsAvailable={accountsAvailable}
            email={account.me?.user.email ?? null}
            keepFiles={keepFiles}
            fileRetentionAvailable={fileRetentionAvailable}
            onSaveProfile={saveProfile}
            onDownloadData={analysis.exportData}
            onDeleteAccount={deleteAccount}
            onStartOver={startOver}
          />
        ) : analysis.state.result ? (
          <ResultPage
            route={route}
            analysis={analysis}
            result={analysis.state.result}
            settings={settings}
            units={units}
            birthYear={athleteValues.birthYear}
            sex={athleteValues.sex}
          />
        ) : (
          <LandingPage
            analysis={analysis}
            signedIn={signedIn}
            units={units}
            onFiles={setup.requestImport}
          />
        )}
      </main>

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
      {setup.open && (
        <SetupDialog
          initial={athleteValues}
          saving={setup.saving}
          error={setup.saveError}
          returning={!signedIn && hasResult}
          onConfirm={(patch) => void setup.finish(patch)}
          onSkip={() => void setup.finish({})}
        />
      )}
    </div>
  )
}
