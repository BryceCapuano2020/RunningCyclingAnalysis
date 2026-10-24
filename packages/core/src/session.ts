import { combine, digestActivity } from './digest'
import { MODEL_REVISION } from './digest/modelRevision'
import type { RangedSource } from './fit'
import { countActivityFiles, extractFitFiles } from './fit'
import { parseActivityFile } from './import'
import { sampleDataset } from './synthetic'
import { requirePositiveFinite } from './math'
import { sha256Hex } from './sha256'
import type { RouteShape } from './route/routeShape'
import type { Activity, ActivityDigest, AthleteSettings, DigestSplits, Sport } from './types'
import { dedupeKey, heldCopyReason, hiddenDigests, outranksHeld } from './duplicates'
import { ACTIVITY } from './fit/zipDirectory'
import { PeriodCache, sameDigests, splitPeriods } from './period'
import { NO_TRENDS } from './digest/trendPoints'
import { HEADLINE_DURATION_S } from './constants'
import { haltsImport, SyncFailure } from './saveFailure'
import type { SyncIssue, SyncIssueCode } from './saveFailure'
import type { RejectedFile, SessionState } from './sessionState'
import { recordHolders } from './records'
import type { EarnedRecord } from './records'

export { haltsImport, SyncFailure } from './saveFailure'
export type { SyncIssue, SyncIssueCode } from './saveFailure'
export type { RejectedFile, SessionState } from './sessionState'
// The device library keeps one copy per workout by the same rule the analysis uses.
export { copyOfDigest, dedupeKey, outranks } from './duplicates'
export type { Copy } from './duplicates'

/** What the sink receives for each newly digested activity. */
export interface SyncItem {
  digest: ActivityDigest
  /** The activity file's name inside its source (a zip entry path, or the file name). */
  fileName: string
  /** Lowercase hex SHA-256 of bytes. */
  fileHash: string
  /** The activity file's bytes. The session drops its reference once the sink returns. */
  bytes: Uint8Array
  /** The route shape of the activity, when it has a GPS track. Kept on the device, never uploaded. */
  route?: RouteShape
}

export type SyncSink = (item: SyncItem) => Promise<void>

/** An activity file as the sink receives it. */
type ImportedFile = Omit<SyncItem, 'digest' | 'route'>

/**
 * State shared by the activities of one import: the first halting failure, and the copies skipped
 * because a better format of the same workout is already held.
 */
interface SaveBatch {
  halt: SyncIssueCode | null
  duplicates: RejectedFile[]
  /** The digests this import added to the library, by key. A replacement updates its entry. */
  added: Map<string, ActivityDigest>
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
  // Whether the headline trend carries each week's running equivalent, which only an age-graded
  // Balance trend uses. Off until the page asks for it.
  private gradeTrend = false
  private periods = new PeriodCache()
  // The last record holders, with the digests and masses they were computed from.
  private recordsCache: {
    digests: ActivityDigest[]
    massKg: number
    bikeMassKg: number
    records: Map<string, EarnedRecord[]>
  } | null = null

  async addFiles(
    sources: RangedSource[],
    settings: AthleteSettings,
    onProgress?: (filesRead: number) => void,
    sink?: SyncSink,
    syncExisting = false,
    onComplete?: (outcome: {
      activities: number
      rejected: number
      duplicates: RejectedFile[]
      added: ActivityDigest[]
    }) => void,
  ): Promise<SessionState> {
    if (this.isSample) this.clear()
    const batch: SaveBatch = { halt: null, duplicates: [], added: new Map() }
    let filesRead = 0
    const outcome = { activities: 0, rejected: 0 }
    for (const source of sources) {
      let undecodable = 0
      const readBefore = filesRead
      const summary = await extractFitFiles(
        source,
        async (file) => {
          const parsed = parseActivityFile(file.bytes, file.fileName)
          if (parsed.ok) {
            outcome.activities += parsed.activities.length
            const fileHash = sink === undefined ? '' : await sha256Hex(file.bytes)
            const imported: ImportedFile = { fileName: file.fileName, fileHash, bytes: file.bytes }
            for (const activity of parsed.activities) {
              await this.consider(activity, imported, sink, syncExisting, batch)
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
          // An activity file that could not be read was still read, so progress reaches its total.
          if (ACTIVITY.test(fileName)) onProgress?.(++filesRead)
        },
      )
      // An archive that stops early, or loses an entry, reports nothing for the files it did not
      // reach. They count as read here, up to the total its directory lists.
      const expected = (await countActivityFiles([source])) ?? 0
      for (let left = expected - (filesRead - readBefore); left > 0; left--)
        onProgress?.(++filesRead)
      this.unsupported.set(source.name, summary.otherActivityFiles)
      outcome.rejected += summary.otherActivityFiles
      // A corrupt file is already reported under its own name, so do not also call it empty.
      if (summary.fitFiles === 0 && summary.otherActivityFiles === 0 && undecodable === 0) {
        outcome.rejected++
        this.rejected.set(source.name, 'No supported activity files found (FIT, GPX or TCX)')
      }
    }
    // Only digests still visible count as added, so the order the files arrive in does not matter.
    const hidden = hiddenDigests([...this.digests.values()])
    const added = [...batch.added.values()].filter((digest) => !hidden.has(digest))
    onComplete?.({ ...outcome, duplicates: batch.duplicates, added })
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

  /** Throws a RangeError for a body or bike mass that is not a positive finite number. */
  setSettings(settings: AthleteSettings): SessionState {
    requirePositiveFinite('massKg', settings.massKg)
    requirePositiveFinite('bikeMassKg', settings.bikeMassKg)
    return this.state(settings)
  }

  /** Asks for the headline trend's running equivalents, which an age-graded Balance trend needs. */
  setGradeTrend(on: boolean, settings: AthleteSettings): SessionState {
    this.gradeTrend = on
    return this.state(settings)
  }

  setRange(rangeDays: number | null, settings: AthleteSettings): SessionState {
    this.rangeDays = rangeDays
    return this.state(settings)
  }

  clear(): SessionState {
    this.reset()
    this.rangeDays = null
    return this.state(null)
  }

  /**
   * Keeps one activity of an import, unless a richer copy of the same workout is already held. That
   * copy is reported as a duplicate and is not synced. Equally rich copies are both saved, and the
   * analysis hides one of them. A poorer copy is saved but hidden from the analysis.
   */
  private async consider(
    activity: Activity,
    file: ImportedFile,
    sink: SyncSink | undefined,
    syncExisting: boolean,
    batch: SaveBatch,
  ): Promise<void> {
    const reason = heldCopyReason(this.digests.values(), activity, file.fileName)
    if (reason !== null) {
      batch.duplicates.push({ fileName: file.fileName, reason })
      return
    }
    await this.keep(activity, file, sink, syncExisting, batch)
  }

  /**
   * Digests one parsed activity and hands it to the sink. An activity already held and saved is
   * left alone unless syncExisting requests a sink call for an existing activity (for example,
   * to retain an original after that preference is enabled). A copy that outranks the held one for
   * the same start second replaces it. A sink failure is counted, not thrown.
   * After a halting failure, the rest of the batch is digested but not sent to the sink.
   */
  private async keep(
    activity: Activity,
    file: ImportedFile,
    sink: SyncSink | undefined,
    syncExisting: boolean,
    batch: SaveBatch,
  ): Promise<void> {
    const key = dedupeKey(activity.sport, activity.startMs)
    const held = this.digests.get(key)
    const replaces = held !== undefined && outranksHeld(activity, file.fileName, held)
    if (
      held !== undefined &&
      !replaces &&
      (sink === undefined || (!this.unsynced.has(key) && !syncExisting))
    )
      return
    const digest = held !== undefined && !replaces ? held : digestActivity(activity)
    this.digests.set(key, digest)
    if (held === undefined || batch.added.has(key)) batch.added.set(key, digest)
    this.outdatedKeys.delete(key)
    this.incompatibleKeys.delete(key)
    if (sink === undefined) return
    if (batch.halt !== null) {
      this.unsynced.set(key, batch.halt)
      return
    }
    try {
      await sink({ digest, route: activity.route, ...file })
      this.unsynced.delete(key)
    } catch (error) {
      const code = error instanceof SyncFailure ? error.code : 'server'
      this.unsynced.set(key, code)
      if (haltsImport(code)) batch.halt = code
    }
  }

  /** The run splits of a held activity, for its activity page. Null when it has none or is not held. */
  splitsOf(id: string): DigestSplits | null {
    for (const digest of this.digests.values()) {
      if (digest.id === id) return digest.splits ?? null
    }
    return null
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

  /**
   * The best efforts each activity holds across the visible library, not the period. They are reused
   * while the digests and both masses are the same.
   */
  private recordsFor(
    visible: ActivityDigest[],
    settings: AthleteSettings,
  ): Map<string, EarnedRecord[]> {
    const cached = this.recordsCache
    if (
      cached !== null &&
      cached.massKg === settings.massKg &&
      cached.bikeMassKg === settings.bikeMassKg &&
      sameDigests(cached.digests, visible)
    ) {
      return cached.records
    }
    const records = recordHolders(visible, settings)
    this.recordsCache = {
      digests: visible,
      massKg: settings.massKg,
      bikeMassKg: settings.bikeMassKg,
      records,
    }
    return records
  }

  /** Null settings only after clear, when the library is empty and nothing needs analysing. */
  private state(settings: AthleteSettings | null): SessionState {
    const all = [...this.digests.values()]
    const hidden = hiddenDigests(all)
    const visible = all.filter((d) => !hidden.has(d))
    const { selected, previous, startMs } = splitPeriods(visible, this.rangeDays)
    const analysis = settings !== null && selected.length > 0 ? combine(selected, settings) : null
    // The selected period's bike model prices the trend and the previous period alike.
    const bikeModel = analysis?.bikeModel
    const efforts =
      settings === null
        ? NO_TRENDS
        : this.periods.trends(
            selected,
            settings,
            this.rangeDays,
            startMs,
            bikeModel,
            this.gradeTrend ? analysis?.hr : undefined,
          )
    return {
      result: analysis,
      trend: efforts[HEADLINE_DURATION_S],
      effortTrends: efforts,
      previous:
        settings !== null && bikeModel !== undefined && previous.length > 0
          ? this.periods.previousCurves(selected, previous, settings, bikeModel)
          : null,
      rejected: [...this.rejected].map(([fileName, reason]) => ({ fileName, reason })),
      unsupportedFiles: [...this.unsupported.values()].reduce((a, b) => a + b, 0),
      isSample: this.isSample,
      totalActivities: visible.length,
      outdatedActivities: this.outdatedKeys.size,
      incompatibleActivities: this.incompatibleKeys.size,
      hiddenDuplicates: hidden.size,
      rangeDays: this.rangeDays,
      syncIssues: this.syncIssues(),
      records:
        settings === null ? new Map<string, EarnedRecord[]>() : this.recordsFor(visible, settings),
    }
  }
}
