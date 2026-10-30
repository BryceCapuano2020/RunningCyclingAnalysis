import { applyCountedRuns } from './countedRuns'
import { MODEL_REVISION } from './digest/modelRevision'
import type { RangedSource } from './fit'
import { DEFAULT_EXTRACT_LIMITS } from './fit'
import type { ExtractLimits } from './fit'
import { countImportFiles } from './import/activitiesCsv'
import type { ImportProgress, ReadFile, Refused } from './sessionSource'
import { importSource, sortRead } from './sessionSource'
import { DEFAULT_ATHLETE, SAMPLE_CLOCK } from './synthetic'
import { seasonDigests } from './sessionSample'
import type { SampleClock } from './synthetic'
import { requirePositiveFinite } from './math'
import type { ActivityDigest, AthleteSettings, DigestSplits, Sport } from './types'
import { dedupeKey, hiddenDigests } from './duplicates'
import { PeriodCache } from './period'
import type { PeriodChoice } from './period'
import { countIssues } from './saveFailure'
import type { SyncIssueCode } from './saveFailure'
import type { SessionState } from './sessionState'
import { buildState } from './sessionBuild'
import { beginImportUnsynced, clearUnsynced, considerActivity, resetUnsynced } from './sessionKeep'
import type { KeepState } from './sessionKeep'
import type { ActivityListeners, ImportCompletion } from './sessionHooks'
import type { SaveBatch, SyncSink } from './sessionSync'
import { RecordsCache } from './sessionRecords'
import { zonesAt, HeartRateJudge, ZoneTimeCache } from './zones'
import type { ZoneSet } from './zones'

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
  // Never replaced, only emptied: sessionKeep.ts holds the same collections (see `keeping`).
  private readonly digests = new Map<string, ActivityDigest>()
  // Activities whose last sink call failed, and why. Re-importing the file tries them again.
  private readonly unsynced = new Map<string, SyncIssueCode>()
  // The keys the latest import left in `unsynced`, so its own failures can be told from earlier ones.
  private readonly latestUnsynced = new Set<string>()
  private readonly outdatedKeys = new Set<string>()
  private readonly incompatibleKeys = new Set<string>()
  // The same collections, as sessionKeep.ts reads and changes them. Only its helpers change the two unsaved ones.
  private readonly keeping: KeepState = {
    digests: this.digests,
    unsynced: this.unsynced,
    latestUnsynced: this.latestUnsynced,
    outdatedKeys: this.outdatedKeys,
    incompatibleKeys: this.incompatibleKeys,
  }
  // The files the last import refused, each listed as it was refused, and how many it left unread
  // for being in a format the app does not read. Both are replaced by the next import.
  private rejected: Refused[] = []
  private unsupported = { files: 0 }
  private isSample = false
  // The period the athlete picked. The default is the most recent window that holds both sports.
  private choice: PeriodChoice = 'default'
  private periods = new PeriodCache()
  private zoneTimes = new ZoneTimeCache()
  private judge = new HeartRateJudge()
  // The extraction limits of every import. The constants unless a test or caller sets others.
  private readonly limits: ExtractLimits
  private recordsCache = new RecordsCache()
  // Today for the fitness status (a seam for tests); the sample season keeps its own day while on screen.
  clock: () => number = Date.now
  private sampleNowMs = 0

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
    onComplete?: (outcome: ImportCompletion) => void,
    onActivity?: ActivityListeners['kept'],
    onReplaced?: ActivityListeners['replaced'],
  ): Promise<SessionState> {
    if (this.isSample) this.clear()
    // The rejected files are those of this import, so an earlier import's are not listed again.
    this.rejected.length = 0
    this.unsupported.files = 0
    beginImportUnsynced(this.keeping)
    const batch: SaveBatch = { halt: null, networkStreak: 0, added: new Map() }
    const progress: ImportProgress = { filesRead: 0, onProgress }
    const outcome = { activities: 0, rejected: 0, notActivities: 0 }
    const read: ReadFile[] = []
    const listeners: ActivityListeners = { kept: onActivity, replaced: onReplaced }
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
        consider: (activity, file) =>
          considerActivity(this.keeping, activity, file, sink, syncExisting, batch, listeners),
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
    clearUnsynced(this.keeping, key)
    this.outdatedKeys.delete(key)
    this.incompatibleKeys.delete(key)
    return this.state(settings)
  }

  /** Whether a saved workout is held out of the analysis for being made by an older model. */
  hasOutdated(sport: Sport, startMs: number): boolean {
    return this.outdatedKeys.has(dedupeKey(sport, startMs))
  }

  /**
   * Replaces the library with digests stored elsewhere. With `keepUnsaved`, for a server library, an
   * activity whose save failed stays and stays unsaved, so adding its file again retries it, unless
   * the server holds that workout. A library read from this browser leaves them out.
   */
  loadDigests(
    digests: ActivityDigest[],
    settings: AthleteSettings,
    { keepUnsaved = false }: { keepUnsaved?: boolean } = {},
  ): SessionState {
    const before = new Map(this.digests)
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
    for (const key of keepUnsaved ? this.unsynced.keys() : []) {
      const digest = before.get(key)
      if (digest === undefined) continue
      if (!this.digests.has(key)) this.digests.set(key, digest)
      else {
        clearUnsynced(this.keeping, key)
      }
    }
    for (const key of outdatedKeys) {
      if (!this.digests.has(key)) this.outdatedKeys.add(key)
    }
    for (const key of incompatibleKeys) {
      if (!this.digests.has(key)) this.incompatibleKeys.add(key)
    }
    return this.state(settings)
  }

  /** Loads the sample athlete's season as it stands on `clock`'s day; without one, the fixed reference season. */
  loadSample(settings: AthleteSettings, clock: SampleClock = SAMPLE_CLOCK): SessionState {
    this.reset()
    this.isSample = true
    this.sampleNowMs = clock.nowMs
    for (const digest of seasonDigests(clock)) this.digests.set(digest.id, digest)
    return this.state(settings)
  }

  /** Throws a RangeError for a body or bike mass that is not a positive finite number. */
  setSettings(settings: AthleteSettings): SessionState {
    requirePositiveFinite('massKg', settings.massKg)
    requirePositiveFinite('bikeMassKg', settings.bikeMassKg)
    return this.state(settings)
  }

  /** The zones in effect on a date: the dated settings first, else the whole library's references, whatever the period. */
  zonesAt(at: number, settings: AthleteSettings): ZoneSet[] {
    return zonesAt(at, this.athleteFor(settings), this.state(settings).zoneEstimates)
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

  /** The run splits of a held activity, for its activity page. Null when it has none or is not held. */
  splitsOf(id: string): DigestSplits | null {
    for (const digest of this.digests.values()) if (digest.id === id) return digest.splits ?? null
    return null
  }

  private reset(): void {
    resetUnsynced(this.keeping)
    this.resetLibrary()
  }

  private resetLibrary(): void {
    this.digests.clear()
    this.zoneTimes.clear()
    this.outdatedKeys.clear()
    this.incompatibleKeys.clear()
    this.rejected.length = 0
    this.unsupported.files = 0
    this.isSample = false
  }

  /** The settings the analysis uses: the sample athlete ignores the visitor's masses, dated ones and counted runs. */
  private athleteFor(settings: AthleteSettings): AthleteSettings {
    if (!this.isSample) return settings
    return { massKg: DEFAULT_ATHLETE.massKg, bikeMassKg: DEFAULT_ATHLETE.bikeMassKg }
  }

  /** Null settings only after clear, when the library is empty and nothing needs analysing. */
  private state(settings: AthleteSettings | null): SessionState {
    const athlete = settings === null ? null : this.athleteFor(settings)
    const { digests, keys } = applyCountedRuns([...this.digests], athlete?.countedRuns)
    return buildState(
      {
        digests,
        countedWalkingRuns: keys,
        choice: this.choice,
        isSample: this.isSample,
        periods: this.periods,
        zoneTimes: this.zoneTimes,
        judge: this.judge,
        recordsCache: this.recordsCache,
        rejected: this.rejected.map(({ file }) => file),
        unsupportedFiles: this.unsupported.files,
        outdatedActivities: this.outdatedKeys.size,
        incompatibleActivities: this.incompatibleKeys.size,
        syncIssues: countIssues(this.unsynced, this.latestUnsynced),
        nowMs: this.isSample ? this.sampleNowMs : this.clock(),
      },
      athlete,
    )
  }
}
