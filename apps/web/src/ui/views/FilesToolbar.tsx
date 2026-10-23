import type { AthleteSettings } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { Dropzone, RangePicker, SettingsBar } from '../components'
import type { AnalysisController } from '../useAnalysis'

/** A change to the settings a signed-in or signed-out user keeps. */
export type ProfilePatch = Partial<{
  settings: AthleteSettings
  units: UnitSystem
  keepFiles: boolean
}>

const RETENTION_UNAVAILABLE =
  'Original file storage is unavailable on this deployment. Your saved preference is preserved; new imports save summaries only and original files stay on this device. Existing saved originals are not deleted.'

export interface FilesToolbarProps {
  analysis: AnalysisController
  settings: AthleteSettings
  units: UnitSystem
  signedIn: boolean
  keepFiles: boolean
  fileRetentionAvailable: boolean
  onSaveProfile: (next: ProfilePatch) => void
}

/**
 * The files and settings bar shared by both views. It is mounted in the same place in both, so
 * the dropzone and its status region stay mounted when the view switches.
 */
export function FilesToolbar({
  analysis,
  settings,
  units,
  signedIn,
  keepFiles,
  fileRetentionAvailable,
  onSaveProfile,
}: FilesToolbarProps) {
  const { result, rangeDays, totalActivities } = analysis.state
  const fileRetentionControls = signedIn && (
    <>
      <label className="app__keep-files">
        <input
          type="checkbox"
          checked={keepFiles}
          disabled={!fileRetentionAvailable}
          aria-describedby="file-retention-help"
          onChange={(event) => onSaveProfile({ keepFiles: event.target.checked })}
        />
        Keep original files in my library
      </label>
      <p id="file-retention-help" className="app__retention-help muted">
        Originals let you rebuild saved analyses later. Turning this off deletes saved originals;
        activity summaries remain.
      </p>
      {/* Always mounted, so the notice is announced when it appears. */}
      <p role="status" className={fileRetentionAvailable ? 'app__quiet' : undefined}>
        {fileRetentionAvailable ? '' : RETENTION_UNAVAILABLE}
      </p>
    </>
  )
  return (
    <section className={result ? 'card app__toolbar' : undefined} aria-label="Files and settings">
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
            onChange={(next) => onSaveProfile({ settings: next })}
          />
          {fileRetentionControls}
          <RangePicker
            rangeDays={rangeDays}
            onChange={analysis.setRange}
            shown={result.activities.length}
            total={totalActivities}
          />
          {!signedIn && (
            <button type="button" className="btn" onClick={analysis.clear} disabled={analysis.busy}>
              Start over
            </button>
          )}
        </>
      )}
    </section>
  )
}
