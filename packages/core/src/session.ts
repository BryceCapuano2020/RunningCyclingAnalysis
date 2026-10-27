import { activitySummaries, digestActivity } from './digest'
import { MODEL_REVISION } from './digest/modelRevision'
import type { RangedSource } from './fit'
import { DEFAULT_EXTRACT_LIMITS } from './fit'
import type { ExtractLimits } from './fit'
import { countImportFiles } from './import/activitiesCsv'
import type { Considered, ImportProgress, ReadFile, Refused } from './sessionSource'
import { importSource, sortRead } from './sessionSource'
import { DEFAULT_ATHLETE, sampleDataset } from './synthetic'
import { requirePositiveFinite } from './math'
import type { Activity, ActivityDigest, AthleteSettings, DigestSplits, Sport } from './types'
import { dedupeKey, fileNameOf, heldCopyOf, hiddenDigests, outranksHeld } from './duplicates'
import { PeriodCache, sameDigests, splitPeriods } from './period'
import type { PeriodChoice } from './period'
import { NO_TRENDS } from './digest/trendPoints'
import { HEADLINE_DURATION_S } from './constants'
import { countIssues, stopsSaving, SyncFailure } from './saveFailure'
import type { SyncIssueCode } from './saveFailure'
import type { RejectedFile, SessionState } from './sessionState'
import type { ImportedFile, SaveBatch, SyncSink } from './sessionSync'
import { recordHolders } from './records'
import type { EarnedRecord } from './records'

export { haltsImport, stopsSaving, SyncFailure } from './saveFailure'
export type { SyncIssue, SyncIssueCode } from './saveFailure'
export type { RejectedFile, SessionState } from './sessionState'
export type { Period, PeriodChoice } from './period'
export type { RejectCode, Rejection } from './import/result'
// The device library keeps one copy per workout by the same rule the analysis uses.
export { copyOfDigest, dedupeKey, outranks } from './duplicates'
export type { Copy } from './duplicates'

export type { SyncItem, SyncSink } from './sessionSync'

/**
 * Holds one digest per activity between requests, so that changing a setting re-runs the
 * analysis without re-reading files. Raw activities are digested on arrival and then dropped.
 * Lives inside the Web Worker.
 */
export class AnalysisSession {
  private digests = new Map<string, ActivityDigest>()
  // Activities whose last sink call failed, and why. Re-importing the file tries them again.
  private unsynced = new Map<string, SyncIssueCode>()
  // The keys the latest import left in `unsynced`, so its own failures can be told from earlier ones.
  private latestUnsynced = new Set<string>()
  private outdatedKeys = new Set<string>()
  private incompatibleKeys = new Set<string>()
  // The files the last import refused, each listed as it was refused, and how many it left unread
  // for being in a format the app does not read. Both are replaced by the next import.
  private rejected: Refused[] = []
  private unsupported = { files: 0 }
  private isSample = false
  // The period the athlete picked. The default is the most recent window that holds both sports.
  private choice: PeriodChoice = 'default'
  // Whether the headline trend carries each week's running equivalent, which only an age-graded
  // Balance trend uses. Off until the page asks for it.
  private gradeTrend = false
  private periods = new PeriodCache()
  // The extraction limits of every import. The constants unless a test or caller sets others.
  private readonly limits: ExtractLimits
  // The last record holders, with the digests and masses they were computed from.
  private recordsCache: {
    digests: ActivityDigest[]
    massKg: number
    bikeMassKg: number
    records: Map<string, EarnedRecord[]>
  } | null = null

  /**
   * Production passes no limits, so the constants apply. The argument is a seam for tests, which need
   * a small budget to reach the limits without a large file.
   */
  constructor(limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS) {
    this.limits = limits
  }

  /**
   * How many activity files an import of these sources would read, counted by this session's limits
   * and the lists of the exports among them, without reading the files. Null when it is not known.
   */
  countFiles(sources: readonly RangedSource[]): Promise<number | null> {
    return countImportFiles(sources, this.limits)
  }

  async addFiles(
    sources: RangedSource[],
    settings: AthleteSettings,
    onProgress?: (filesRead: number) => void,
    sink?: SyncSink,
    syncExisting = false,
    onComplete?: (outcome: {
      /** The activities read, which a file may hold several of. */
      activities: number
      /** The files that added a workout the library now holds and shows: not refused, and not all already held or hidden as copies. */
      filesAdded: number
      rejected: number
      /** Activity files the export's list does not name, such as saved routes, left unread and not counted as rejected. */
      notActivities: number
      duplicates: RejectedFile[]
      added: ActivityDigest[]
    }) => void,
  ): Promise<SessionState> {
    if (this.isSample) this.clear()
    // The rejected files are those of this import, so an earlier import's are not listed again.
    this.rejected.length = 0
    this.unsupported.files = 0
    this.latestUnsynced.clear()
    const batch: SaveBatch = { halt: null, added: new Map() }
    const progress: ImportProgress = { filesRead: 0, onProgress }
    const outcome = { activities: 0, rejected: 0, notActivities: 0 }
    const read: ReadFile[] = []
    for (const [index, source] of sources.entries()) {
      await importSource(source, {
        limits: this.limits,
        progress,
        source: index,
        outcome,
        refused: this.rejected,
        read,
        unsupported: this.unsupported,
        hashFiles: sink !== undefined,
        consider: (activity, file) => this.consider(activity, file, sink, syncExisting, batch),
      })
    }
    // Only digests still visible count as added, so the order the files arrive in does not matter.
    const hidden = hiddenDigests([...this.digests.values()])
    const added = [...batch.added.values()].filter((digest) => !hidden.has(digest))
    const visible = [...this.digests.values()].filter((digest) => !hidden.has(digest))
    const files = sortRead(read, new Set(added), visible)
    onComplete?.({ ...outcome, ...files, added })
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

  setRange(choice: PeriodChoice, settings: AthleteSettings): SessionState {
    this.choice = choice
    return this.state(settings)
  }

  /**
   * Chooses the period without analysing, so the next load is analysed once, on that period. Nothing
   * to choose keeps the period the session has.
   */
  choosePeriod(choice: PeriodChoice | undefined): void {
    if (choice !== undefined) this.choice = choice
  }

  clear(): SessionState {
    this.reset()
    return this.state(null)
  }

  /**
   * Keeps one activity of an import, unless a richer copy of the same workout is already held. That
   * copy is not synced. Equally rich copies are both saved, and the analysis hides one of them. A
   * poorer copy is saved but hidden from the analysis. Says what became of the activity: the digest
   * it added, or the name of the held file when its workout was already in the library, whether this
   * is a copy, the same file again or a richer copy that replaces the held one.
   */
  private async consider(
    activity: Activity,
    file: ImportedFile,
    sink: SyncSink | undefined,
    syncExisting: boolean,
    batch: SaveBatch,
  ): Promise<Considered> {
    const copyOf = heldCopyOf(this.digests.values(), activity, file.fileName)
    if (copyOf !== null) return { held: copyOf }
    return this.keep(activity, file, sink, syncExisting, batch)
  }

  /**
   * Digests one parsed activity and hands it to the sink. An activity already held and saved is
   * left alone unless syncExisting requests a sink call for an existing activity (for example,
   * to retain an original after that preference is enabled). A copy that outranks the held one for
   * the same start second replaces it. A sink failure is counted, not thrown.
   * After a failure that stops saving, the rest of the batch is digested but not sent to the sink.
   * A held activity whose save failed is not yet in the library for good: it is added when this
   * import saves it, and is otherwise still the held workout, however it came to be left unsaved.
   */
  private async keep(
    activity: Activity,
    file: ImportedFile,
    sink: SyncSink | undefined,
    syncExisting: boolean,
    batch: SaveBatch,
  ): Promise<Considered> {
    const key = dedupeKey(activity.sport, activity.startMs)
    const held = this.digests.get(key)
    const replaces = held !== undefined && outranksHeld(activity, file.fileName, held)
    if (
      held !== undefined &&
      !replaces &&
      (sink === undefined || (!this.unsynced.has(key) && !syncExisting))
    )
      return { held: fileNameOf(held.id) }
    // A workout this import is adding, or has added: new to the library, or a later copy of one.
    const adding = held === undefined || batch.added.has(key)
    const retry = !adding && this.unsynced.has(key)
    const digest = held !== undefined && !replaces ? held : digestActivity(activity)
    this.digests.set(key, digest)
    if (adding) batch.added.set(key, digest)
    this.outdatedKeys.delete(key)
    this.incompatibleKeys.delete(key)
    const considered = (saved: boolean): Considered => {
      if (retry && saved) batch.added.set(key, digest)
      return adding || (retry && saved) || held === undefined
        ? { added: digest }
        : { held: fileNameOf(held.id) }
    }
    if (sink === undefined) return considered(false)
    if (batch.halt !== null) {
      // An activity already saved, offered again to keep its file, is not waiting for a save.
      if (held === undefined || replaces || this.unsynced.has(key)) {
        this.leaveUnsynced(key, batch.halt)
      }
      return considered(false)
    }
    try {
      await sink({ digest, route: activity.route, ...file })
      this.unsynced.delete(key)
    } catch (error) {
      const code = error instanceof SyncFailure ? error.code : 'server'
      this.leaveUnsynced(key, code)
      if (stopsSaving(code)) batch.halt = code
      return considered(false)
    }
    return considered(true)
  }

  private leaveUnsynced(key: string, code: SyncIssueCode): void {
    this.unsynced.set(key, code)
    this.latestUnsynced.add(key)
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
    this.latestUnsynced.clear()
    this.resetLibrary()
  }

  private resetLibrary(): void {
    this.digests.clear()
    this.outdatedKeys.clear()
    this.incompatibleKeys.clear()
    this.rejected.length = 0
    this.unsupported.files = 0
    this.isSample = false
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

  /**
   * The settings the analysis uses. The sample athlete has its own body and bike masses, so it
   * ignores the visitor's while it is on screen.
   */
  private athleteFor(settings: AthleteSettings): AthleteSettings {
    if (!this.isSample) return settings
    return { ...settings, massKg: DEFAULT_ATHLETE.massKg, bikeMassKg: DEFAULT_ATHLETE.bikeMassKg }
  }

  /** Null settings only after clear, when the library is empty and nothing needs analysing. */
  private state(settings: AthleteSettings | null): SessionState {
    const all = [...this.digests.values()]
    // Every change to the library is followed by a state, so the analyses it made stale go here.
    this.periods.releaseAbsent(all)
    const hidden = hiddenDigests(all)
    const visible = all.filter((d) => !hidden.has(d))
    const { period, selected, previous } = splitPeriods(visible, this.choice)
    const athlete = settings === null ? null : this.athleteFor(settings)
    // A period with no activities still has a result, so the page can say what is missing from it.
    const analysis =
      athlete !== null && visible.length > 0 ? this.periods.analysis(selected, athlete) : null
    // The selected period's bike model prices the trend and the previous period alike.
    const bikeModel = analysis?.bikeModel
    const efforts =
      athlete === null
        ? NO_TRENDS
        : this.periods.trends(
            selected,
            athlete,
            period.days,
            // All time is not clipped at a start, so its trend begins at the first activity.
            period.days === null ? null : period.startMs,
            bikeModel,
            // The sample is graded as its own athlete, so its rides carry their equivalents too.
            this.gradeTrend || this.isSample ? analysis?.hr : undefined,
          )
    return {
      result: analysis,
      trend: efforts[HEADLINE_DURATION_S],
      effortTrends: efforts,
      previous:
        athlete !== null && bikeModel !== undefined && previous.length > 0
          ? this.periods.previousCurves(selected, previous, athlete, bikeModel)
          : null,
      rejected: this.rejected.map(({ file }) => file),
      unsupportedFiles: this.unsupported.files,
      isSample: this.isSample,
      totalActivities: visible.length,
      outdatedActivities: this.outdatedKeys.size,
      incompatibleActivities: this.incompatibleKeys.size,
      hiddenDuplicates: hidden.size,
      period,
      library: settings === null ? [] : activitySummaries(visible),
      syncIssues: countIssues(this.unsynced, this.latestUnsynced),
      records:
        athlete === null ? new Map<string, EarnedRecord[]>() : this.recordsFor(visible, athlete),
    }
  }
}
