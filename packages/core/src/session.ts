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
  /** Activities the sink could not save and that have not been saved since. */
  syncFailures: number
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
  // Keys of activities whose last sink call failed. Re-importing the file tries them again.
  private unsynced = new Set<string>()
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
  ): Promise<SessionState> {
    if (this.isSample) this.clear()
    let filesRead = 0
    for (const source of sources) {
      let undecodable = 0
      const summary = await extractFitFiles(
        source,
        async (file) => {
          const parsed = parseFit(file.bytes, file.fileName)
          if (parsed.ok) {
            const fileHash = sink === undefined ? '' : await sha256Hex(file.bytes)
            for (const activity of parsed.activities) {
              await this.keep(
                activity,
                { fileName: file.fileName, fileHash, bytes: file.bytes },
                sink,
              )
            }
            // A file that now reads cleanly replaces an earlier rejection under the same name.
            this.rejected.delete(file.fileName)
            this.rejected.delete(`${file.fileName}.gz`)
          } else {
            this.rejected.set(parsed.fileName, parsed.reason)
          }
          onProgress?.(++filesRead)
        },
        (fileName, reason) => {
          undecodable++
          this.rejected.set(fileName, reason)
        },
      )
      this.unsupported.set(source.name, summary.otherActivityFiles)
      // A corrupt file is already reported under its own name, so do not also call it empty.
      if (summary.fitFiles === 0 && summary.otherActivityFiles === 0 && undecodable === 0) {
        this.rejected.set(source.name, 'No FIT files found')
      }
    }
    return this.state(settings)
  }

  /** Replaces the whole library with digests that were stored elsewhere (the server). */
  loadDigests(digests: ActivityDigest[], settings: AthleteSettings): SessionState {
    this.reset()
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
   * left alone, so a duplicate import is not sent again. A sink failure is counted, not thrown.
   */
  private async keep(
    activity: Activity,
    file: { fileName: string; fileHash: string; bytes: Uint8Array },
    sink: SyncSink | undefined,
  ): Promise<void> {
    const key = dedupeKey(activity.sport, activity.startMs)
    const held = this.digests.get(key)
    if (held !== undefined && (sink === undefined || !this.unsynced.has(key))) return
    const digest = held ?? digestActivity(activity)
    this.digests.set(key, digest)
    this.outdatedKeys.delete(key)
    this.incompatibleKeys.delete(key)
    if (sink === undefined) return
    try {
      await sink({ digest, ...file })
      this.unsynced.delete(key)
    } catch {
      this.unsynced.add(key)
    }
  }

  private reset(): void {
    this.digests.clear()
    this.unsynced.clear()
    this.outdatedKeys.clear()
    this.incompatibleKeys.clear()
    this.rejected.clear()
    this.unsupported.clear()
    this.isSample = false
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
      syncFailures: this.unsynced.size,
    }
  }
}
