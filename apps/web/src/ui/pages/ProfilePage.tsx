import { useState } from 'react'
import type { UnitSystem } from '@rca/core/units'
import type { Sex } from '@rca/contract'
import { PrivacyNote, SegmentedControl, SettingsBar } from '../components'
import { AccountSection } from '../components/AccountSection'
import { AthleteFields } from '../components/AthleteFields'
import { FileRetention } from '../components/FileRetention'
import { SavedLibraryCard } from '../components/SavedLibraryCard'
import { UNIT_OPTIONS, displayBirthYear, readBirthYear } from '../athlete'
import type { WeightSettings } from '../athlete'
import type { AnalysisController } from '../useAnalysis'
import type { ProfilePatch } from '../profilePatch'
import { PAGE_HEADING_ID } from './pageHeading'

export interface ProfilePageProps {
  analysis: AnalysisController
  settings: WeightSettings
  units: UnitSystem
  birthYear: number | null
  sex: Sex | null
  signedIn: boolean
  /** Accounts are available on this deployment, so sign-in can be offered. */
  accountsAvailable: boolean
  /** The signed-in account's email, or null when signed out. */
  email: string | null
  keepFiles: boolean
  fileRetentionAvailable: boolean
  /** Resolves once the change is saved, and rejects with the reason when it is not. */
  onSaveProfile: (next: ProfilePatch) => Promise<void>
  /** Resolves with the account's data as a JSON file. Used only when signed in. */
  onDownloadData: () => Promise<Blob>
  /** Resolves when the account is gone. Used only when signed in. */
  onDeleteAccount: () => Promise<void>
  /** Clears the analysis; the app then returns to the landing page. */
  onStartOver: () => void
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
  email,
  keepFiles,
  fileRetentionAvailable,
  onSaveProfile,
  onDownloadData,
  onDeleteAccount,
  onStartOver,
}: ProfilePageProps) {
  // The year as typed. Null means the field shows the saved year; it is saved when left.
  const [yearDraft, setYearDraft] = useState<string | null>(null)
  const [yearError, setYearError] = useState<string | null>(null)
  const canStartOver = !signedIn && analysis.state.result !== null

  // Only the weight bar shows a failed save, since it keeps the text to correct. Other changes keep
  // their saved value and say nothing when they are refused.
  function saveQuietly(next: ProfilePatch) {
    void onSaveProfile(next).catch(() => undefined)
  }

  function commitYear() {
    if (yearDraft === null) return
    const read = readBirthYear(yearDraft)
    if ('error' in read) {
      setYearError(read.error)
      return
    }
    setYearDraft(null)
    setYearError(null)
    if (read.year !== birthYear) saveQuietly({ birthYear: read.year })
  }

  return (
    <div className="page-stack">
      <div className="page-head">
        <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
          Profile
        </h1>
      </div>

      <section className="section" aria-labelledby="profile-body">
        <h2 id="profile-body">You and your bike</h2>
        <SettingsBar
          settings={settings}
          units={units}
          onChange={(next) => onSaveProfile({ settings: next })}
        />
        <AthleteFields
          birthYear={yearDraft ?? displayBirthYear(birthYear)}
          birthYearError={yearError}
          sex={sex}
          onBirthYearChange={(text) => {
            setYearError(null)
            setYearDraft(text)
          }}
          onBirthYearCommit={commitYear}
          onSexChange={(next) => saveQuietly({ sex: next })}
        />
      </section>

      <section className="section" aria-labelledby="profile-units">
        <h2 id="profile-units">Units</h2>
        <SegmentedControl
          legend="Units"
          legendHidden
          options={UNIT_OPTIONS}
          selected={units}
          onSelect={(next) => saveQuietly({ units: next })}
        />
      </section>

      {email !== null ? (
        <AccountSection
          email={email}
          onDownloadData={onDownloadData}
          onDeleteAccount={onDeleteAccount}
        />
      ) : (
        accountsAvailable && (
          <section className="section" aria-labelledby="profile-account">
            <h2 id="profile-account">Account</h2>
            <p className="secondary">
              Sign in with Google, at the top of the page, to keep your library on any device.
              Analysis still runs in your browser. Activity summaries are saved to your private
              account, original files too if you choose, and you can delete everything at any time.
            </p>
          </section>
        )
      )}

      {signedIn && (
        <section className="section" aria-labelledby="profile-files">
          <h2 id="profile-files">Original files</h2>
          <FileRetention
            keepFiles={keepFiles}
            fileRetentionAvailable={fileRetentionAvailable}
            onChange={(next) => saveQuietly({ keepFiles: next })}
          />
        </section>
      )}

      <SavedLibraryCard analysis={analysis} signedIn={signedIn} />

      {canStartOver && (
        <section className="section" aria-labelledby="profile-start-over">
          <h2 id="profile-start-over">Start over</h2>
          <p className="secondary">
            Removes the activities kept in this browser so you can start again.
          </p>
          <div>
            <button type="button" className="btn" onClick={onStartOver} disabled={analysis.busy}>
              Start over
            </button>
          </div>
        </section>
      )}

      <PrivacyNote
        signedIn={signedIn}
        keepFiles={keepFiles}
        fileRetentionAvailable={fileRetentionAvailable}
      />
    </div>
  )
}
