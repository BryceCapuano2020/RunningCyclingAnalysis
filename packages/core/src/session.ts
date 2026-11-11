import { applyCountedRuns } from './countedRuns'
import { DEFAULT_EXTRACT_LIMITS, type ExtractLimits, type RangedSource } from './fit'
import { ZIP } from './fit/zipDirectory'
import { countImportFiles } from './import/activitiesCsv'
import { isCompanion, takeCompanion } from './import/looseList'
import type { ImportProgress, ReadFile, Refused } from './sessionSource'
import { importSource } from './sessionSource'
import { DEFAULT_ATHLETE, SAMPLE_CLOCK, type SampleClock } from './synthetic'
import { seasonDigests } from './sessionSample'
import { setViewerZone, withViewerZone } from './calendar'
import type { Zone } from './calendar'
import { requirePositiveFinite } from './math'
import type { ActivityDigest, AthleteSettings, DigestSplits, Sport } from './types'
import { workoutKey, hiddenDigests } from './duplicates'
import type { HeldFiles } from './importHeld'
import { SessionLibrary } from './sessionLibrary'
import { PeriodCache, type PeriodChoice } from './period'
import { countIssues, type SyncIssueCode } from './saveFailure'
import type { ImportFacts, SessionState } from './sessionState'
import { buildState } from './sessionBuild'
import { checkInSnapshotOf } from './sessionCheckIn'
import type { CheckInSnapshot } from './lookback/snapshot'
import {
  beginImportUnsynced,
  clearUnsynced,
  considerActivity,
  heldNameOf,
  markUnsynced,
  resetUnsynced,
} from './sessionKeep'
import {
  dropWorkout,
  fillLibrary,
  hasOutdated,
  heldIds,
  hiddenIds,
  indexFactsOf,
  replaceDigest,
  splitsOf,
} from './sessionIndex'
import type { IndexFacts, ReplaceOptions } from './sessionIndex'
import type { KeepState } from './sessionKeep'
import type { ActivityListeners, ImportCompletion } from './sessionHooks'
import { newSaveBatch, type SyncSink } from './sessionSync'
import { RecordsCache } from './sessionRecords'
import { completionOf } from './sessionComplete'
import { zonesAt, HeartRateJudge, ZoneTimeCache } from './zones'
import type { ZoneSet } from './zones'

export * from './sessionExports'

type Tail<T extends unknown[]> = T extends [unknown, ...infer R] ? R : never

/**
 * Holds one digest per activity between requests, so that changing a setting re-runs the
 * analysis without re-reading files. Raw activities are digested on arrival and then dropped.
 * Lives inside the Web Worker.
 */
export class AnalysisSession {
  // Never replaced, only emptied: sessionKeep.ts holds the same collections (see `keeping`).
  private readonly library = new SessionLibrary()
  // Activities whose last sink call failed, and why. Re-importing the file tries them again.
  private readonly unsynced = new Map<string, SyncIssueCode>()
  // The keys the latest import left in `unsynced`, so its own failures can be told from earlier ones.
  private readonly latestUnsynced = new Set<string>()
  // The same collections, as sessionKeep.ts reads and changes them. Only its helpers change the two unsaved ones.
  private readonly keeping: KeepState = {
    library: this.library,
    unsynced: this.unsynced,
    latestUnsynced: this.latestUnsynced,
  }
  // The files the last import refused, each listed as it was refused, and how many it left unread
  // for being in a format the app does not read. Both are replaced by the next import.
  private rejected: Refused[] = []
  private unsupported = { files: 0 }
  private isSample = false
  // The period the athlete picked. The default is searched for: the shortest window in which every sport qualifies (answer/window.ts).
  private choice: PeriodChoice = 'default'
  private periods = new PeriodCache()
  private zoneTimes = new ZoneTimeCache()
  private judge = new HeartRateJudge()
  // The extraction limits of every import. The constants unless a test or caller sets others.
  private readonly limits: ExtractLimits
  private recordsCache = new RecordsCache()
  private zone: Zone | null
  // Today for the fitness status (a seam for tests); the sample keeps its own day on screen.
  clock: () => number = Date.now
  private sampleNowMs = 0

  /**
   * Production passes no limits (a test's seam: a small budget reaches them without a large file). A zone cuts
   * every analysis of this session's days there, whatever another session in the process uses (the server's jobs).
   */
  constructor(limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS, zone: Zone | null = null) {
    this.limits = limits
    this.zone = zone
  }

  /**
   * How many activity files an import of these sources would read, counted by this session's limits
   * and the lists of the exports among them, without reading the files. Null when it is not known.
   */
  countFiles(sources: readonly RangedSource[]): Promise<number | null> {
    // The export's list given loose is not an activity file, so it is not in the count.
    return countImportFiles(
      sources.filter((source) => !isCompanion(source.name)),
      this.limits,
    )
  }

  /** Reads the files into the library and saves them through the sink, building no state (an account's results are the server's). */
  async importFiles(
    sources: RangedSource[],
    onProgress?: (filesRead: number) => void,
    sink?: SyncSink,
    syncExisting = false,
    onComplete?: (outcome: ImportCompletion) => void,
    onActivity?: ActivityListeners['kept'],
    onReplaced?: ActivityListeners['replaced'],
    held?: HeldFiles,
  ): Promise<void> {
    if (this.isSample) this.reset()
    // The rejected files are this import's only.
    this.rejected.length = 0
    this.unsupported.files = 0
    beginImportUnsynced(this.keeping)
    const batch = newSaveBatch()
    const { rest, companion } = await takeCompanion(sources)
    const hints = { needsList: false }
    const progress: ImportProgress = { filesRead: 0, onProgress }
    const outcome = { activities: 0, rejected: 0, notActivities: 0 }
    const read: ReadFile[] = []
    const listedTypes = new Map<string, string>()
    const skippedTypes: Record<string, number> = {}
    const listeners: ActivityListeners = { kept: onActivity, replaced: onReplaced }
    try {
      for (const [index, source] of rest.entries()) {
        await importSource(source, {
          limits: this.limits,
          progress,
          source: index,
          outcome,
          refused: this.rejected,
          read,
          unsupported: this.unsupported,
          skippedTypes,
          companion,
          hints,
          loose: !ZIP.test(source.name),
          hashFiles: sink !== undefined,
          listedTypes,
          held,
          heldNameOf: (keys) => heldNameOf(this.keeping, keys, sink !== undefined),
          consider: (activity, file) =>
            considerActivity(this.keeping, activity, file, sink, syncExisting, batch, listeners),
        })
      }
    } finally {
      // Saves the sink began in the background settle before the import ends, whatever ended it.
      await Promise.all(batch.inflight)
    }
    // Only visible digests count as added, whatever the order. One that replaced a held-out digest is upgraded, not added.
    const analysable = this.library.analysable().map(([, digest]) => digest)
    const hidden = hiddenDigests(analysable)
    // Work a sink held back until the copies of each workout were known (an original is kept for the shown copy only).
    if (sink?.finish !== undefined && batch.halt === null) {
      const hiddenCopies = new Set([...hidden].map((digest) => digest.id))
      for (const { key, code } of await sink.finish(hiddenCopies))
        markUnsynced(this.keeping, key, code)
    }
    onComplete?.(
      completionOf({
        outcome,
        read,
        batch,
        analysable,
        hidden,
        listedTypes,
        skippedTypes,
        companion,
        needsList: hints.needsList,
      }),
    )
  }

  async addFiles(
    sources: RangedSource[],
    settings: AthleteSettings,
    ...rest: Tail<Parameters<AnalysisSession['importFiles']>>
  ): Promise<SessionState> {
    await this.importFiles(sources, ...rest)
    return this.state(settings)
  }

  /**
   * Gives the viewer's zone, once, at the edge that knows it: where a file recorded no local day, the days and
   * weeks are cut in this zone (calendar.ts). The browser's worker has one zone, so this also sets the module's,
   * which the digesting of a file reads; a session built with a zone needs no call.
   */
  setZone(zone: Zone): void {
    this.zone = zone
    setViewerZone(zone)
  }

  /** The ids of the digests the analysis hides as copies of a better one. */
  hiddenIds = (): Set<string> => hiddenIds(this.keeping)

  /** The id of the digest held under each workout key, in order; undefined for a key not held. */
  heldIds = (keys: readonly string[]) => heldIds(this.keeping, keys)

  /** Moves one saved workout to a digest rebuilt from its original, building no state. Says whether it moved. */
  replaceDigest = (key: string, digest: ActivityDigest): boolean =>
    replaceDigest(this.keeping, key, digest)

  /** A save ended after the import that left it waiting: the workout is no longer on the unsaved list. */
  markSaved = (key: string): void => clearUnsynced(this.keeping, key)

  /** Whether a saved workout is held out of the analysis for being made by an older model. */
  hasOutdated = (sport: Sport, startMs: number): boolean =>
    hasOutdated(this.keeping, sport, startMs)

  /** The run splits of a held activity, for its activity page. Null when it has none or is not held. */
  splitsOf = (id: string): DigestSplits | null => splitsOf(this.keeping, id)

  /** Removes one saved workout after its server deletion succeeds; builds no state. */
  dropActivity(sport: Sport, startMs: number): void {
    dropWorkout(this.keeping, workoutKey(sport, startMs))
  }

  removeActivity(sport: Sport, startMs: number, settings: AthleteSettings): SessionState {
    this.dropActivity(sport, startMs)
    return this.state(settings)
  }

  /** Replaces the library with digests stored elsewhere (see `fillLibrary`); builds no state. */
  replaceLibrary(digests: ActivityDigest[], options: ReplaceOptions = {}): void {
    const before = new Map(this.library.digests)
    this.resetLibrary()
    fillLibrary(this.keeping, digests, before, options)
  }

  loadDigests(
    digests: ActivityDigest[],
    settings: AthleteSettings,
    options: ReplaceOptions = {},
  ): SessionState {
    this.replaceLibrary(digests, options)
    return this.state(settings)
  }

  /** What the index knows of the library's age and size (see `indexFactsOf`). */
  indexFacts = (): IndexFacts => indexFactsOf(this.keeping)

  /** What the last import left that the server's results do not hold: refused files and unsaved activities. */
  importFacts(): ImportFacts {
    return {
      rejected: this.rejected.map(({ file }) => file),
      unsupportedFiles: this.unsupported.files,
      syncIssues: countIssues(this.unsynced, this.latestUnsynced),
    }
  }

  /** Loads the sample athlete's season as it stands on `clock`'s day; without one, the fixed reference season. */
  loadSample(settings: AthleteSettings, clock: SampleClock = SAMPLE_CLOCK): SessionState {
    this.reset()
    this.isSample = true
    this.sampleNowMs = clock.nowMs
    for (const digest of seasonDigests(clock)) this.library.digests.set(digest.id, digest)
    return this.state(settings)
  }

  /** Throws a RangeError for a mass that is not a positive finite number. */
  setSettings(settings: AthleteSettings): SessionState {
    requirePositiveFinite('massKg', settings.massKg)
    requirePositiveFinite('bikeMassKg', settings.bikeMassKg)
    return this.state(settings)
  }

  /** The zones in effect on a date: the dated settings first, else the whole library's references, whatever the period. */
  zonesAt(at: number, settings: AthleteSettings): ZoneSet[] {
    return this.inZone(() =>
      zonesAt(at, this.athleteFor(settings), this.state(settings).zoneEstimates),
    )
  }

  setRange(choice: PeriodChoice, settings: AthleteSettings): SessionState {
    this.choice = choice
    return this.state(settings)
  }

  /** Chooses the period without analysing, so the next load is analysed once on it; none keeps the session's. */
  choosePeriod(choice: PeriodChoice | undefined): void {
    if (choice !== undefined) this.choice = choice
  }

  clear(): SessionState {
    this.reset()
    return this.state(null)
  }

  /**
   * The library as the analysis reads it, summarised for "since your last import" (see lookback/snapshot.ts), with the
   * fitness and look-back of `state`. Null when the session holds nothing to compare or shows the sample, which
   * keeps no baseline.
   */
  checkInSnapshot(state: SessionState, nowMs: number): CheckInSnapshot | null {
    if (this.isSample || this.library.size === 0) return null
    const digests = this.library.analysable().map(([, digest]) => digest)
    return this.inZone(() => checkInSnapshotOf(digests, state, nowMs))
  }

  private reset(): void {
    resetUnsynced(this.keeping)
    this.resetLibrary()
  }

  private resetLibrary(): void {
    this.library.clear()
    this.zoneTimes.clear()
    this.rejected.length = 0
    this.unsupported.files = 0
    this.isSample = false
  }

  /** The settings the analysis uses: the sample athlete ignores the visitor's masses, dated ones and counted runs. */
  private athleteFor(settings: AthleteSettings): AthleteSettings {
    if (!this.isSample) return settings
    return { massKg: DEFAULT_ATHLETE.massKg, bikeMassKg: DEFAULT_ATHLETE.bikeMassKg }
  }

  private inZone<T>(run: () => T): T {
    return this.zone === null ? run() : withViewerZone(this.zone, run)
  }

  /** Null settings only after clear, when the library is empty and nothing needs analysing. */
  private state(settings: AthleteSettings | null): SessionState {
    return this.inZone(() => this.stateIn(settings))
  }

  private stateIn(settings: AthleteSettings | null): SessionState {
    const athlete = settings === null ? null : this.athleteFor(settings)
    const { digests, keys } = applyCountedRuns(this.library.analysable(), athlete?.countedRuns)
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
        ...this.indexFacts(),
        ...this.importFacts(),
        nowMs: this.isSample ? this.sampleNowMs : this.clock(),
      },
      athlete,
    )
  }
}
