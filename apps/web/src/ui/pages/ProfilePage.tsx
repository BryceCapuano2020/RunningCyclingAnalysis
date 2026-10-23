import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { PrivacyNote, SegmentedControl, SettingsBar } from '../components'
import type { AnalysisController } from '../useAnalysis'
import { FileRetention } from '../components/FileRetention'
import type { ProfilePatch } from '../profilePatch'
import { SavedLibraryCard } from '../components/SavedLibraryCard'
import { PAGE_HEADING_ID } from './pageHeading'

export interface ProfilePageProps {
  analysis: AnalysisController
  settings: AthleteSettings
  units: UnitSystem
  signedIn: boolean
  /** Accounts are available on this deployment, so sign-in can be offered. */
  accountsAvailable: boolean
  keepFiles: boolean
  fileRetentionAvailable: boolean
  onSaveProfile: (next: ProfilePatch) => void
  /** Clears the analysis; the app then returns to the landing page. */
  onStartOver: () => void
}

const UNIT_OPTIONS: { value: UnitSystem; label: string }[] = [
  { value: 'imperial', label: 'Imperial' },
  { value: 'metric', label: 'Metric' },
]

/** The settings you set once: weights, units, account, library and what is kept. */
export function ProfilePage({
  analysis,
  settings,
  units,
  signedIn,
  accountsAvailable,
  keepFiles,
  fileRetentionAvailable,
  onSaveProfile,
  onStartOver,
}: ProfilePageProps) {
  const canStartOver = !signedIn && analysis.state.result !== null
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
      </section>

      <section className="section" aria-labelledby="profile-units">
        <h2 id="profile-units">Units</h2>
        <SegmentedControl
          legend="Units"
          legendHidden
          options={UNIT_OPTIONS}
          selected={units}
          onSelect={(next) => onSaveProfile({ units: next })}
        />
      </section>

      {!signedIn && accountsAvailable && (
        <section className="section" aria-labelledby="profile-account">
          <h2 id="profile-account">Account</h2>
          <p className="secondary">
            Sign in with Google, at the top of the page, to keep your library on any device.
            Analysis still runs in your browser. Activity summaries are saved to your private
            account, original files too if you choose, and you can delete everything at any time.
          </p>
        </section>
      )}

      {signedIn && (
        <section className="section" aria-labelledby="profile-files">
          <h2 id="profile-files">Original files</h2>
          <FileRetention
            keepFiles={keepFiles}
            fileRetentionAvailable={fileRetentionAvailable}
            onChange={(next) => onSaveProfile({ keepFiles: next })}
          />
        </section>
      )}

      <SavedLibraryCard analysis={analysis} signedIn={signedIn} />

      {canStartOver && (
        <section className="section" aria-labelledby="profile-start-over">
          <h2 id="profile-start-over">Start over</h2>
          <p className="secondary">Clears the activities on this page so you can add others.</p>
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
