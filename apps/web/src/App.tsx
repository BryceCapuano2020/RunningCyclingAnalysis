import { useEffect, useRef, useState } from 'react'
import { bodyMassOn } from '@rca/core/athlete'
import './App.css'
import { forgetSeenNotes } from './ui/aboutDataStore'
import { AccountMenu, Header, PrivacyNote } from './ui/components'
import { AddFilesButton } from './ui/components/AddFilesButton'
import { AppNotices } from './ui/components/AppNotices'
import { WALKING_NOTE_PAGES } from './ui/analysis/walkingPaceCopy'
import { ImportStatus } from './ui/components/ImportStatus'
import { SetupDialog } from './ui/components/SetupDialog'
import { SkipLink } from './ui/components/SkipLink'
import { LandingPage } from './ui/pages/LandingPage'
import { listedMoves } from './ui/analysis/whatMoved'
import { ageProfileOf } from './ui/grades'
import { documentTitleFor, useDocumentTitle } from './ui/documentTitle'
import { focusPageHeading } from './ui/pages/pageHeading'
import { ProfilePage } from './ui/pages/ProfilePage'
import { RestoringPage } from './ui/pages/RestoringPage'
import { HeldLibraryPage, UnavailableLibraryPage } from './ui/pages/HeldLibraryPage'
import { pageKeyOf } from './ui/libraryPage'
import { useLibraryPage } from './ui/useLibraryPage'
import { ResultPage } from './ui/pages/ResultPage'
import { MethodPage } from './ui/pages/MethodPage'
import { NO_HEART_RATE_JUDGEMENT } from '@rca/core/digest/setAsideTypes'
import { hrefFor, useRoute } from './ui/route'
import { restoreScroll, useRouteHistory } from './ui/routeHistory'
import { useAccount } from './ui/useAccount'
import { useRouteGuard } from './ui/useRouteGuard'
import { useAnalysis } from './ui/useAnalysis'
import { useBalanceAfterImport } from './ui/useBalanceAfterImport'
import { datedWeightActions } from './ui/datedWeight'
import { SETTINGS_NOT_READY, useMeasurements } from './ui/useMeasurements'
import { useNow } from './ui/useNow'
import { usePreferences } from './ui/useSettings'
import { useSetup } from './ui/useSetup'
import { applyPatch, athleteValuesOf, profileFields } from './ui/profilePatch'
import type { AthleteValues, ProfilePatch } from './ui/profilePatch'
import { weightKnown } from './ui/athlete'
import { useAnalysisSettings } from './ui/useAnalysisSettings'
import { useCountedRuns } from './ui/useCountedRuns'
import { useSignInProblem } from './ui/signInProblem'

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
  const { units } = athleteValues
  const measurements = useMeasurements(account.status, account.me?.user.id ?? null)
  // The weight today is the dated weight in effect today, whatever the saved profile holds, so a weight
  // dated for a later day takes effect on that day with no edit. Without dated weights it is the profile's.
  const now = useNow()
  const settings = {
    ...athleteValues.settings,
    massKg: bodyMassOn(athleteValues.settings.massKg, measurements.entries, now),
  }
  // The analysis and the results take a body mass even before one is entered; see analysisSettings.
  // Memoised on what it reads: an equal settings object built anew must not redraw the share preview.
  const countedRuns = useCountedRuns()
  const signInProblem = useSignInProblem()
  const analysisAthlete = useAnalysisSettings(settings, measurements.entries, countedRuns.keys)
  // The year of birth and sex the grades need, or null while either is missing.
  const ageProfile = ageProfileOf(athleteValues.birthYear, athleteValues.sex)
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

  const { saveProfile, addSetting, removeSetting } = datedWeightActions({
    measurements,
    now,
    profileKg: athleteValues.settings.massKg,
    saveAnswers,
  })

  const analysis = useAnalysis(analysisAthlete, account)

  // The download holds the dated settings, so it waits for them rather than leave them out.
  const downloadData = async () => {
    if (measurements.state !== 'ready') throw new Error(SETTINGS_NOT_READY[measurements.state])
    return analysis.exportData()
  }
  // Sample data carries its own persona weight, so it is weighted whatever the visitor has entered.
  const weighted = analysis.state.isSample || weightKnown(settings)
  // Called after useAnalysis, so its settings are in place before held files are sent.
  const setup = useSetup({
    status: account.status,
    workerStopped: analysis.workerStopped,
    preferencesDone: preferences.setupDone,
    addFiles: analysis.addFiles,
    save: saveProfile,
  })
  const hasResult = analysis.state.result !== null
  // A library is more than a result: one whose digests are all held out has none, and is still a library.
  const { knowledge, page } = useLibraryPage(analysis, route, signedIn)
  // What the last import moved in the athlete's numbers, for the summary and the sync status.
  const moved = listedMoves(analysis.importChange, analysisAthlete, units, ageProfile, weighted)
  const restoringPage = page === 'restoring'
  const key = pageKeyOf(route, page)
  useBalanceAfterImport(analysis.importOutcome, route.page, setup.submitted)
  useRouteHistory()
  useDocumentTitle(documentTitleFor(route, analysis.state.result, analysis.state.library))
  // The account and a signed-in library must answer before the landing page is the true state.
  const settled =
    account.status !== 'loading' &&
    (account.status !== 'signed-in' || analysis.libraryStatus === 'loaded')
  const coldNotice = useRouteGuard({
    route,
    hasResult,
    libraryPresent: knowledge === 'present',
    busy: analysis.busy,
    // A file import queued behind the library, or running while it is not loading.
    waiting: analysis.waitingReason !== null,
    libraryLoading: analysis.libraryStatus === 'loading',
    // A kept library restoring may still bring the result, so the notice waits for it.
    restoring: analysis.restoring,
    settled,
  })

  // A new page replaces the old one, so focus moves to the new page's heading and the page shows
  // from the top, or where the visitor left it when Back returns to it. A link the user followed
  // always moves them; a page that changes by itself, such as a library that loads, only takes
  // focus that was lost with the old page. The first render keeps the browser's own focus and scroll.
  const previousKey = useRef(key)
  const previousHash = useRef(window.location.hash)
  useEffect(() => {
    if (previousKey.current === key) return
    const fromLanding = previousKey.current === 'landing'
    previousKey.current = key
    const followed = previousHash.current !== window.location.hash
    previousHash.current = window.location.hash
    if (!followed && !focusWasLost()) return
    // A first result replaces the landing page, where the visitor may have scrolled down to a sample
    // button that is now gone. That scroll is not a place they left, so the result starts at the top.
    if (fromLanding && !followed) window.scrollTo(0, 0)
    else restoreScroll()
    // Focus without a scroll of its own, so the position just restored is kept.
    focusPageHeading({ preventScroll: true })
  }, [key])

  // Removing all activities clears the analysis in the worker. The landing page shows once the old
  // result is gone, so it never flashes on the way. Leaving Profile first cancels the move; it
  // replaces the Profile history entry rather than adding one.
  const removingAll = useRef(false)
  const removeAll = () => {
    // The runs counted at walking pace are forgotten when the worker reports the library forgotten (rememberKept).
    analysis.clear()
    // With no result on screen the effect below never runs, so the landing page is shown now.
    if (!hasResult) {
      window.location.replace(hrefFor({ page: 'balance' }))
      return
    }
    removingAll.current = true
  }
  useEffect(() => {
    if (!removingAll.current) return
    if (route.page !== 'profile') removingAll.current = false
    else if (!hasResult) {
      removingAll.current = false
      window.location.replace(hrefFor({ page: 'balance' }))
    }
  }, [hasResult, route.page])

  // Once the account is gone, its Profile page has nothing left to show, so the visitor goes to the
  // landing page, which says what was deleted. A failed delete rejects before this line, and the
  // dialog stays open. The note goes once the visitor moves to another page.
  const [accountDeleted, setAccountDeleted] = useState(false)
  const [notedPage, setNotedPage] = useState(route.page)
  if (notedPage !== route.page) {
    setNotedPage(route.page)
    if (route.page !== 'balance') setAccountDeleted(false)
  }
  const deleteAccount = async () => {
    await account.deleteAccount()
    countedRuns.clear()
    setAccountDeleted(true)
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
  // The landing page's drop zone has its own Add files, so the header leaves its button out there.
  const onLanding = key === 'landing'

  return (
    <div className="page">
      <SkipLink />
      {/* While results restore, the tabs show and Add files is left to the restoring page. */}
      <Header
        route={route}
        showTabs={hasResult || analysis.restoring || knowledge === 'present'}
        addFiles={
          restoringPage || onLanding ? null : (
            <AddFilesButton
              onFiles={setup.requestImport}
              primary={hasResult || signedIn || knowledge === 'present'}
            />
          )
        }
        account={
          <AccountMenu
            status={account.status}
            me={account.me}
            onSignIn={account.signIn}
            onSignOut={() => {
              // What this browser noted about the visitor's data goes with their session.
              forgetSeenNotes()
              // The runs counted here go once the session has ended, not if signing out failed.
              void account.signOut().then(countedRuns.clear, () => undefined)
            }}
          />
        }
      />
      {/* Always mounted: file drops anywhere, the busy strip and announcements. */}
      <ImportStatus
        onFiles={setup.requestImport}
        busy={analysis.busy}
        progress={analysis.progress}
        waiting={analysis.waitingReason}
        signedIn={signedIn}
        outcome={analysis.importOutcome}
        rejected={analysis.state.rejected}
        moved={moved}
        onStop={(control) => runThenFocus(analysis.stop, control)}
      />

      <main className="app__main">
        <AppNotices
          analysis={analysis}
          signedIn={signedIn}
          moved={moved}
          keepFiles={keepFiles}
          fileRetentionAvailable={fileRetentionAvailable}
          accountsUnavailable={!accountsAvailable}
          accountError={account.error}
          runThenFocus={runThenFocus}
          atBalance={route.page === 'balance'}
          page={route.page}
          pageNotice={
            accountDeleted && route.page === 'balance'
              ? 'Your account and data were deleted.'
              : (signInProblem ?? coldNotice ?? '')
          }
          walkingNote={WALKING_NOTE_PAGES.includes(route.page)}
          countedRuns={countedRuns}
          libraryPanel={page === 'held'}
        />
        {route.page === 'profile' ? (
          <ProfilePage
            analysis={analysis}
            settings={settings}
            athlete={analysisAthlete}
            units={units}
            birthYear={athleteValues.birthYear}
            sex={athleteValues.sex}
            signedIn={signedIn}
            accountsAvailable={accountsAvailable}
            accountLoading={account.status === 'loading'}
            email={account.me?.user.email ?? null}
            keepFiles={keepFiles}
            fileRetentionAvailable={fileRetentionAvailable}
            onSaveProfile={saveProfile}
            dated={measurements}
            onAddSetting={addSetting}
            onRemoveSetting={removeSetting}
            onSignIn={account.signIn}
            onDownloadData={downloadData}
            onDeleteAccount={deleteAccount}
            onRemoveAll={removeAll}
          />
        ) : page === 'result' && analysis.state.result ? (
          <ResultPage
            route={route}
            analysis={analysis}
            result={analysis.state.result}
            settings={analysisAthlete}
            weightKnown={weighted}
            units={units}
            birthYear={athleteValues.birthYear}
            sex={athleteValues.sex}
            signedIn={signedIn}
            countedRuns={countedRuns}
          />
        ) : restoringPage ? (
          <RestoringPage onFiles={setup.requestImport} />
        ) : page === 'unavailable' ? (
          <UnavailableLibraryPage />
        ) : page === 'held' ? (
          <HeldLibraryPage
            analysis={analysis}
            signedIn={signedIn}
            fileRetentionAvailable={fileRetentionAvailable}
            onFiles={setup.requestImport}
          />
        ) : route.page === 'method' ? (
          <MethodPage
            result={null}
            heartRateJudgement={NO_HEART_RATE_JUDGEMENT}
            units={units}
            profile={null}
            weightKnown={weighted}
            restoring={analysis.restoring}
          />
        ) : (
          <LandingPage analysis={analysis} signedIn={signedIn} onFiles={setup.requestImport} />
        )}
      </main>

      <footer className="app__footer muted">
        <PrivacyNote
          signedIn={signedIn}
          keepFiles={keepFiles}
          fileRetentionAvailable={fileRetentionAvailable}
        />
        <p>
          <a href={hrefFor({ page: 'method' })}>How sure is this?</a>
          {' · '}
          <a href="/privacy">Privacy</a>
        </p>
      </footer>
      {setup.open && (
        <SetupDialog
          initial={athleteValues}
          saving={setup.saving}
          error={setup.saveError}
          onConfirm={(patch) => void setup.finish(patch)}
          onSkip={(patch) => void setup.skip(patch)}
        />
      )}
    </div>
  )
}
