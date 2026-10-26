import { useRef, useState } from 'react'
import type { UnitSystem } from '@rca/core/units'
import type { Sex } from '@rca/contract'
import { SegmentedControl, SettingsBar } from '../components'
import { AccountSection } from '../components/AccountSection'
import { AthleteFields } from '../components/AthleteFields'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FileRetention } from '../components/FileRetention'
import { HowToGetFilesButton } from '../components/HowToGetFiles'
import { GoogleSignInButton } from '../components/GoogleSignInButton'
import { plural } from '../components/plural'
import { SavedLibraryCard } from '../components/SavedLibraryCard'
import { UNIT_OPTIONS, displayBirthYear, readBirthYear } from '../athlete'
import type { WeightSettings } from '../athlete'
import { SAVE_STATE_TEXT, WAITING_FOR_ACCOUNT } from '../analysis/copy'
import type { AnalysisController } from '../useAnalysis'
import type { ProfilePatch } from '../profilePatch'
import { useSaveStatus } from '../useSaveStatus'
import type { SaveState } from '../useSaveStatus'
import { PAGE_HEADING_ID } from './pageHeading'
import './ProfilePage.css'

export interface ProfilePageProps {
  analysis: AnalysisController
  settings: WeightSettings
  units: UnitSystem
  birthYear: number | null
  sex: Sex | null
  signedIn: boolean
  /** Accounts are available on this deployment, so sign-in can be offered. */
  accountsAvailable: boolean
  /** The account is still loading, so the athlete's values are not yet the saved ones. */
  accountLoading: boolean
  /** The signed-in account's email, or null when signed out. */
  email: string | null
  keepFiles: boolean
  fileRetentionAvailable: boolean
  /** Resolves when the change is saved. Rejects when it is refused, and the account shows why. */
  onSaveProfile: (next: ProfilePatch) => Promise<void>
  onSignIn: () => void
  /** Resolves with the account's data as a JSON file. Used only when signed in. */
  onDownloadData: () => Promise<Blob>
  /** Resolves when the account is gone. Used only when signed in. */
  onDeleteAccount: () => Promise<void>
  /** Clears the analysis; the app then returns to the landing page. */
  onRemoveAll: () => void
}

/** The profile fields that save as soon as they change, each with a status line of its own. */
type SavedField = 'year' | 'sex' | 'units'

const FIELD_LABEL: Record<SavedField, string> = {
  year: 'Year of birth',
  sex: 'Sex',
  units: 'Units',
}

/** A field's save status. It stays mounted, empty until the field has saved, so each outcome is announced. */
function FieldStatus({ field, state }: { field: SavedField; state: SaveState | undefined }) {
  return (
    <p role="status" className="profile-save secondary">
      {state === undefined ? '' : `${FIELD_LABEL[field]}: ${SAVE_STATE_TEXT[state]}`}
    </p>
  )
}

/**
 * The question for removing the activities kept in this browser, named by how many there are. The
 * analysis on screen is named only when there is one, since it goes with them.
 */
function removalCopy(kept: number, onScreen: boolean) {
  const screen = onScreen ? ' and the analysis on screen with them' : ''
  if (kept === 0) {
    return {
      title: 'Clear the analysis on this page?',
      description: 'Nothing is kept in this browser, so only the analysis on screen is cleared.',
      confirmLabel: 'Clear',
    }
  }
  return {
    title: `Remove all ${plural(kept, 'activity', 'activities')} kept in this browser?`,
    description: `Their summaries are removed from this browser${screen}. This cannot be undone. Add their files again to bring them back.`,
    confirmLabel: 'Remove all',
  }
}

/** The settings you set once: weights, units, athlete details, account, library and what is kept. */
export function ProfilePage({
  analysis,
  settings,
  units,
  birthYear,
  sex,
  signedIn,
  accountsAvailable,
  accountLoading,
  email,
  keepFiles,
  fileRetentionAvailable,
  onSaveProfile,
  onSignIn,
  onDownloadData,
  onDeleteAccount,
  onRemoveAll,
}: ProfilePageProps) {
  // The year as typed. Null means the field shows the saved year; it is saved when left.
  const [yearDraft, setYearDraft] = useState<string | null>(null)
  const [yearError, setYearError] = useState<string | null>(null)
  const yearSaving = useRef(false)
  // A sex or unit choice shows at once while it saves, and returns to the saved value if it fails.
  const [sexDraft, setSexDraft] = useState<{ value: Sex | null } | null>(null)
  const [unitsDraft, setUnitsDraft] = useState<{ value: UnitSystem } | null>(null)
  const { states: saves, save: saveField } = useSaveStatus<SavedField>()
  const [removing, setRemoving] = useState(false)
  // The retention and account questions are held here, so any open dialog can close a row confirmation.
  const [retentionAsking, setRetentionAsking] = useState(false)
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  // The control that asked for the removal, which takes focus back when the question closes.
  const [removeOpener, setRemoveOpener] = useState<HTMLElement | null>(null)
  // Offered whenever something is kept here, not only when a result is on screen. Removing with no
  // result on screen goes straight to the landing page, so no stale redirect is left behind.
  const hasResult = analysis.state.result !== null
  const canRemoveAll = !signedIn && (hasResult || analysis.savedActivities.length > 0)

  // A question belongs to the section it was asked from. When that section goes, the question goes
  // with it, so it cannot reopen by itself when the section comes back. Done during render, as the
  // list does for its own confirmation.
  if (!signedIn && retentionAsking) setRetentionAsking(false)
  if (email === null && accountDialogOpen) setAccountDialogOpen(false)
  if (!canRemoveAll && removing) setRemoving(false)
  // Stored originals are known once the library has loaded; before that the count is not known.
  const storedFiles =
    analysis.libraryStatus === 'loaded'
      ? Math.max(0, analysis.savedActivities.length - analysis.missingOriginals)
      : null
  const shownSex = sexDraft ? sexDraft.value : sex
  const shownUnits = unitsDraft ? unitsDraft.value : units

  async function changeSex(next: Sex | null) {
    setSexDraft({ value: next })
    await saveField('sex', () => onSaveProfile({ sex: next }))
    setSexDraft(null)
  }

  async function changeUnits(next: UnitSystem) {
    setUnitsDraft({ value: next })
    await saveField('units', () => onSaveProfile({ units: next }))
    setUnitsDraft(null)
  }

  async function commitYear() {
    // Enter and leaving the field both commit; the second waits for the first to finish.
    if (yearDraft === null || yearSaving.current) return
    const read = readBirthYear(yearDraft)
    if ('error' in read) {
      setYearError(read.error)
      return
    }
    setYearError(null)
    if (read.year === birthYear) {
      setYearDraft(null)
      return
    }
    yearSaving.current = true
    const saved = await saveField('year', () => onSaveProfile({ birthYear: read.year }))
    yearSaving.current = false
    // A refused year stays in the field, with its status beside it, until it is corrected or saved.
    if (saved) setYearDraft(null)
  }

  const removal = removalCopy(analysis.savedActivities.length, hasResult)

  return (
    <div className="page-stack">
      <div className="page-head">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          Profile
        </h1>
      </div>

      <div className="profile-pair">
        <section className="section" aria-labelledby="profile-about">
          <div>
            <h2 id="profile-about">About you</h2>
            {/* Outside the held fields, so the wait is announced while they cannot be changed. */}
            <p role="status" className="profile-save secondary">
              {accountLoading ? WAITING_FOR_ACCOUNT : ''}
            </p>
          </div>
          <div inert={accountLoading}>
            <AthleteFields
              birthYear={yearDraft ?? displayBirthYear(birthYear)}
              birthYearError={yearError}
              sex={shownSex}
              onBirthYearChange={(text) => {
                setYearError(null)
                setYearDraft(text)
              }}
              onBirthYearCommit={() => void commitYear()}
              onSexChange={(next) => void changeSex(next)}
            />
            <FieldStatus field="year" state={saves.year} />
            <FieldStatus field="sex" state={saves.sex} />
          </div>
        </section>

        <section className="section" aria-labelledby="profile-body">
          <h2 id="profile-body">Body and bike</h2>
          <div inert={accountLoading}>
            {/* The units come first: they say what the weights below are measured in. */}
            <SegmentedControl
              legend="Units"
              options={UNIT_OPTIONS}
              selected={shownUnits}
              onSelect={(next) => void changeUnits(next)}
            />
            <FieldStatus field="units" state={saves.units} />
            <SettingsBar
              settings={settings}
              units={shownUnits}
              onChange={(next) => onSaveProfile({ settings: next })}
            />
          </div>
        </section>
      </div>

      {email !== null ? (
        <AccountSection
          email={email}
          onDownloadData={onDownloadData}
          onDeleteAccount={onDeleteAccount}
          deleteOpen={accountDialogOpen}
          onDeleteOpenChange={setAccountDialogOpen}
        />
      ) : (
        accountsAvailable &&
        !accountLoading && (
          <section className="section" aria-labelledby="profile-account">
            <h2 id="profile-account">Account</h2>
            <p className="secondary">
              Sign in to keep your library on any device. Analysis still runs in your browser.
              Activity summaries are saved to your private account, original files too if you
              choose, and you can delete everything at any time.
            </p>
            <div>
              <GoogleSignInButton onClick={onSignIn} />
            </div>
          </section>
        )
      )}

      <section className="section" aria-labelledby="profile-get-files">
        <h2 id="profile-get-files">Get your files</h2>
        <p className="secondary">
          The files come from the app or device that recorded your activities. Each guide says how
          to export them.
        </p>
        <div>
          <HowToGetFilesButton />
        </div>
      </section>

      {signedIn && (
        <section className="section" aria-labelledby="profile-files">
          <h2 id="profile-files">Original files</h2>
          <FileRetention
            keepFiles={keepFiles}
            fileRetentionAvailable={fileRetentionAvailable}
            storedFiles={storedFiles}
            asking={retentionAsking}
            onAskingChange={setRetentionAsking}
            onChange={(next) => onSaveProfile({ keepFiles: next })}
          />
        </section>
      )}

      <SavedLibraryCard
        analysis={analysis}
        signedIn={signedIn}
        removalOpen={removing || retentionAsking || accountDialogOpen}
      />

      {canRemoveAll && (
        <section className="section" aria-labelledby="profile-remove">
          <h2 id="profile-remove">Remove activities</h2>
          <p className="secondary">
            {hasResult
              ? 'Removes every activity kept in this browser, and the analysis on screen.'
              : 'Removes every activity kept in this browser.'}
          </p>
          <div>
            <button
              type="button"
              className="btn profile-remove"
              disabled={analysis.busy}
              onClick={(event) => {
                setRemoveOpener(event.currentTarget)
                setRemoving(true)
              }}
            >
              Remove all my activities
            </button>
          </div>
          {analysis.busy && (
            <p className="secondary">Available when the current analysis finishes.</p>
          )}
          <ConfirmDialog
            open={removing}
            opener={removeOpener}
            title={removal.title}
            description={removal.description}
            confirmLabel={removal.confirmLabel}
            onConfirm={() => {
              setRemoving(false)
              onRemoveAll()
            }}
            onClose={() => setRemoving(false)}
          />
        </section>
      )}
    </div>
  )
}
