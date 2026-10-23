import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { useEffect, useRef, useState } from 'react'
import type { ProfileInput } from '@rca/contract'
import './App.css'
import { AccountMenu, Header, PrivacyNote } from './ui/components'
import { AddFilesButton } from './ui/components/AddFilesButton'
import { AppNotices } from './ui/components/AppNotices'
import { ImportStatus } from './ui/components/ImportStatus'
import { LandingPage } from './ui/pages/LandingPage'
import { PAGE_HEADING_ID } from './ui/pages/pageHeading'
import { ProfilePage } from './ui/pages/ProfilePage'
import { ResultPage } from './ui/pages/ResultPage'
import type { Route } from './ui/route'
import { hrefFor, useRoute } from './ui/route'
import { useAccount } from './ui/useAccount'
import { useAnalysis } from './ui/useAnalysis'
import { usePreferences } from './ui/useSettings'
import type { ProfilePatch } from './ui/profilePatch'

/** A string that changes whenever a different page is on screen. */
function pageKey(route: Route, hasResult: boolean): string {
  if (route.page === 'profile') return 'profile'
  if (!hasResult) return 'landing'
  return route.page === 'activity' ? `activity:${route.id}` : route.page
}

function focusPageHeading() {
  document.getElementById(PAGE_HEADING_ID)?.focus()
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
  const hasResult = analysis.state.result !== null
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
        addFiles={<AddFilesButton onFiles={analysis.addFiles} primary={hasResult || signedIn} />}
        account={
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
      {/* Always mounted, under the header: file drops anywhere, progress and announcements. */}
      <ImportStatus
        onFiles={analysis.addFiles}
        busy={analysis.busy}
        progress={analysis.progress}
        waiting={analysis.waitingReason}
        signedIn={signedIn}
        outcome={analysis.importOutcome}
      />

      <AppNotices
        analysis={analysis}
        signedIn={signedIn}
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
            signedIn={signedIn}
            accountsAvailable={accountsAvailable}
            keepFiles={keepFiles}
            fileRetentionAvailable={fileRetentionAvailable}
            onSaveProfile={saveProfile}
            onStartOver={startOver}
          />
        ) : analysis.state.result ? (
          <ResultPage
            route={route}
            analysis={analysis}
            result={analysis.state.result}
            settings={settings}
            units={units}
          />
        ) : (
          <LandingPage analysis={analysis} signedIn={signedIn} units={units} />
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
    </div>
  )
}
