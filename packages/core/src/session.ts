import { combine, digestActivity } from './digest'
import { MODEL_REVISION } from './digest/modelRevision'
import type { AnalysisResult } from './digest'
import type { FitSource } from './fit'
import { extractFitFiles, parseFit } from './fit'
import { sampleDataset } from './synthetic'
import type { Activity, ActivityDigest, AthleteSettings, Sport } from './types'

export interface RejectedFile {
  fileName: string
  reason: string
}

/** Why an activity could not be saved to the signed-in library. Drives the user-facing message. */
export type SyncIssueCode =
  | 'signed-out'
  | 'account-changed'
  | 'activity-quota'
  | 'storage-quota'
  | 'storage-budget'
  | 'file-too-large'
  | 'rate-limited'
  | 'daily-limit'
  | 'upload-in-progress'
  | 'account-deleting'
  | 'network'
  | 'server'

export interface SyncIssue {
  code: SyncIssueCode
  /** Activities affected in the current library session. */
  count: number
}

/** A sink throws this to say why a save failed. Any other error is reported as 'server'. */
export class SyncFailure extends Error {
  readonly code: SyncIssueCode

  constructor(code: SyncIssueCode, message: string) {
    super(message)
    this.name = 'SyncFailure'
    this.code = code
  }
}

const HALTING_CODES: ReadonlySet<SyncIssueCode> = new Set<SyncIssueCode>([
  'signed-out',
  'account-changed',
  'account-deleting',
])

/**
 * Whether a failure ends the import: once the account is signed out or changed, later saves in the
 * same import would fail the same way, so they are not attempted.
 */
export function haltsImport(code: SyncIssueCode): boolean {
  return HALTING_CODES.has(code)
}

export interface SessionState {
  /** Null until at least one activity has been loaded. */
  result: AnalysisResult | null
  rejected: RejectedFile[]
  /** Activity files in formats this app does not read (GPX, TCX) that were skipped. */
  unsupportedFiles: number
  isSample: boolean
  /** Activities loaded, before the period filter. */
  totalActivities: number
  /** Stored activities excluded because their digest model is older than this app's. */
  outdatedActivities: number
  /** Stored activities excluded because their digest model is from a newer app version. */
  incompatibleActivities: number
  /** Only activities from the last rangeDays days before the newest one are analysed; null = all. */
  rangeDays: number | null
  /** Activities the sink could not save, by cause, until they are saved or the library is cleared. */
  syncIssues: SyncIssue[]
}

/** What the sink receives for each newly digested activity. */
export interface SyncItem {
  digest: ActivityDigest
  /** The FIT file's name inside its source (a zip entry path, or the file name). */
  fileName: string
  /** Lowercase hex SHA-256 of bytes. */
  fileHash: string
  /** The FIT file's bytes. The session drops its reference once the sink returns. */
  bytes: Uint8Array
}

export type SyncSink = (item: SyncItem) => Promise<void>

/** Set by the first halting failure of one import, so later saves in it are skipped. */
interface SaveBatch {
  halt: SyncIssueCode | null
}

/** The same workout exported twice has the same sport and start second. */
function dedupeKey(sport: Sport, startMs: number): string {
  return `${sport}-${Math.round(startMs / 1000)}`
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Every FIT byte array here is backed by a plain ArrayBuffer, never a SharedArrayBuffer.
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Holds one digest per activity between requests, so that changing a setting re-runs the
 * analysis without re-reading files. Raw activities are digested on arrival and then dropped.
 * Lives inside the Web Worker.
 */
export class AnalysisSession {
  private digests = new Map<string, ActivityDigest>()
  // Activities whose last sink call failed, and why. Re-importing the file tries them again.
  private unsynced = new Map<string, SyncIssueCode>()
  private outdatedKeys = new Set<string>()
  private incompatibleKeys = new Set<string>()
  // Keyed by file name so importing the same export twice does not double-count.
  private rejected = new Map<string, string>()
  private unsupported = new Map<string, number>()
  private isSample = false
  private rangeDays: number | null = null

  async addFiles(
    sources: FitSource[],
    settings: AthleteSettings,
    onProgress?: (filesRead: number) => void,
    sink?: SyncSink,
    syncExisting = false,
    onComplete?: (outcome: { activities: number; rejected: number }) => void,
  ): Promise<SessionState> {
    if (this.isSample) this.clear()
    const batch: SaveBatch = { halt: null }
    let filesRead = 0
    const outcome = { activities: 0, rejected: 0 }
    for (const source of sources) {
      let undecodable = 0
      const summary = await extractFitFiles(
        source,
        async (file) => {
          const parsed = parseFit(file.bytes, file.fileName)
          if (parsed.ok) {
            outcome.activities += parsed.activities.length
            const fileHash = sink === undefined ? '' : await sha256Hex(file.bytes)
            for (const activity of parsed.activities) {
              await this.keep(
                activity,
                { fileName: file.fileName, fileHash, bytes: file.bytes },
                sink,
                syncExisting,
                batch,
              )
            }
            // A file that now reads cleanly replaces an earlier rejection under the same name.
            this.rejected.delete(file.fileName)
            this.rejected.delete(`${file.fileName}.gz`)
          } else {
            outcome.rejected++
            this.rejected.set(parsed.fileName, parsed.reason)
          }
          onProgress?.(++filesRead)
        },
        (fileName, reason) => {
          undecodable++
          outcome.rejected++
          this.rejected.set(fileName, reason)
        },
      )
      this.unsupported.set(source.name, summary.otherActivityFiles)
      outcome.rejected += summary.otherActivityFiles
      // A corrupt file is already reported under its own name, so do not also call it empty.
      if (summary.fitFiles === 0 && summary.otherActivityFiles === 0 && undecodable === 0) {
        outcome.rejected++
        this.rejected.set(source.name, 'No FIT files found')
      }
    }
    onComplete?.(outcome)
    return this.state(settings)
  }

  /** Removes one saved workout after its owner-scoped server deletion succeeds. */
  removeActivity(sport: Sport, startMs: number, settings: AthleteSettings): SessionState {
    const key = dedupeKey(sport, startMs)
    this.digests.delete(key)
    this.unsynced.delete(key)
    this.outdatedKeys.delete(key)
    this.incompatibleKeys.delete(key)
    return this.state(settings)
  }

  /** Replaces the whole library with digests that were stored elsewhere (the server). */
  loadDigests(digests: ActivityDigest[], settings: AthleteSettings): SessionState {
    // Sync issues stay: those activities are still unsaved, whatever the library now holds.
    this.resetLibrary()
    const outdatedKeys = new Set<string>()
    const incompatibleKeys = new Set<string>()
    for (const digest of digests) {
      const key = dedupeKey(digest.sport, digest.startMs)
      if (digest.modelRevision !== MODEL_REVISION) {
        if (digest.modelRevision < MODEL_REVISION) outdatedKeys.add(key)
        else incompatibleKeys.add(key)
        continue
      }
      this.digests.set(key, digest)
    }
    for (const key of outdatedKeys) {
      if (!this.digests.has(key)) this.outdatedKeys.add(key)
    }
    for (const key of incompatibleKeys) {
      if (!this.digests.has(key)) this.incompatibleKeys.add(key)
    }
    return this.state(settings)
  }

  loadSample(settings: AthleteSettings): SessionState {
    this.reset()
    this.isSample = true
    for (const activity of sampleDataset().activities) {
      this.digests.set(activity.id, digestActivity(activity))
    }
    return this.state(settings)
  }

  setSettings(settings: AthleteSettings): SessionState {
    return this.state(settings)
  }

  setRange(rangeDays: number | null, settings: AthleteSettings): SessionState {
    this.rangeDays = rangeDays
    return this.state(settings)
  }

  clear(): SessionState {
    this.reset()
    this.rangeDays = null
    return this.state({ massKg: 0, bikeMassKg: 0 })
  }

  /**
   * Digests one parsed activity and hands it to the sink. An activity already held and saved is
   * left alone unless syncExisting requests a sink call for an existing activity (for example,
   * to retain an original after that preference is enabled). A sink failure is counted, not thrown.
   * After a halting failure, the rest of the batch is digested but not sent to the sink.
   */
  private async keep(
    activity: Activity,
    file: { fileName: string; fileHash: string; bytes: Uint8Array },
    sink: SyncSink | undefined,
    syncExisting: boolean,
    batch: SaveBatch,
  ): Promise<void> {
    const key = dedupeKey(activity.sport, activity.startMs)
    const held = this.digests.get(key)
    if (held !== undefined && (sink === undefined || (!this.unsynced.has(key) && !syncExisting)))
      return
    const digest = held ?? digestActivity(activity)
    this.digests.set(key, digest)
    this.outdatedKeys.delete(key)
    this.incompatibleKeys.delete(key)
    if (sink === undefined) return
    if (batch.halt !== null) {
      this.unsynced.set(key, batch.halt)
      return
    }
    try {
      await sink({ digest, ...file })
      this.unsynced.delete(key)
    } catch (error) {
      const code = error instanceof SyncFailure ? error.code : 'server'
      this.unsynced.set(key, code)
      if (haltsImport(code)) batch.halt = code
    }
  }

  private reset(): void {
    this.unsynced.clear()
    this.resetLibrary()
  }

  private resetLibrary(): void {
    this.digests.clear()
    this.outdatedKeys.clear()
    this.incompatibleKeys.clear()
    this.rejected.clear()
    this.unsupported.clear()
    this.isSample = false
  }

  private syncIssues(): SyncIssue[] {
    const counts = new Map<SyncIssueCode, number>()
    for (const code of this.unsynced.values()) counts.set(code, (counts.get(code) ?? 0) + 1)
    return [...counts].map(([code, count]) => ({ code, count }))
  }

  private state(settings: AthleteSettings): SessionState {
    const all = [...this.digests.values()]
    let selected = all
    if (this.rangeDays !== null && all.length > 0) {
      // Anchored to the newest activity, not today, so an old export still shows its last weeks.
      const newest = all.reduce((latest, d) => Math.max(latest, d.startMs), -Infinity)
      const cutoff = newest - this.rangeDays * 86_400_000
      selected = all.filter((d) => d.startMs >= cutoff)
    }
    return {
      result: selected.length > 0 ? combine(selected, settings) : null,
      rejected: [...this.rejected].map(([fileName, reason]) => ({ fileName, reason })),
      unsupportedFiles: [...this.unsupported.values()].reduce((a, b) => a + b, 0),
      isSample: this.isSample,
      totalActivities: all.length,
      outdatedActivities: this.outdatedKeys.size,
      incompatibleActivities: this.incompatibleKeys.size,
      rangeDays: this.rangeDays,
      syncIssues: this.syncIssues(),
    }
  }
}
