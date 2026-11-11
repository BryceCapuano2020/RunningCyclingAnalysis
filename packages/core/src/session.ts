import { applyCountedRuns } from './countedRuns'
import { DEFAULT_EXTRACT_LIMITS, type ExtractLimits, type RangedSource } from './fit'
import { ZIP } from './fit/zipDirectory'
import { countImportFiles } from './import/activitiesCsv'
import { isCompanion, takeCompanion } from './import/looseList'
import type { ImportProgress, ReadFile, Refused } from './sessionSource'
import { importSource, sortRead } from './sessionSource'
import { DEFAULT_ATHLETE, SAMPLE_CLOCK, type SampleClock } from './synthetic'
import { seasonDigests } from './sessionSample'
import { setViewerZone, withViewerZone } from './calendar'
import type { Zone } from './calendar'
import { requirePositiveFinite } from './math'
import type { ActivityDigest, AthleteSettings, DigestSplits, Sport } from './types'
import { workoutKey, hiddenDigests } from './duplicates'
import type { HeldFiles } from './importHeld'
import { SessionLibrary, readRank } from './sessionLibrary'
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
  keepUnsavedFrom,
  markUnsynced,
  resetUnsynced,
} from './sessionKeep'
import type { KeepState } from './sessionKeep'
import type { ActivityListeners, ImportCompletion } from './sessionHooks'
import { newSaveBatch, type SyncSink } from './sessionSync'
import { RecordsCache } from './sessionRecords'
import { zonesAt, HeartRateJudge, ZoneTimeCache } from './zones'
import type { ZoneSet } from './zones'

export { haltsImport, isTransient, stopsSaving, SyncFailure } from './saveFailure'
export type { SyncIssue, SyncIssueCode } from './saveFailure'
export type { ImportFacts, RejectedFile, SessionState } from './sessionState'
export type { HeldOutActivity } from './sessionLibrary'
export type { Period, PeriodChoice } from './period'
export type { RejectCode, Rejection } from './import/result'
// The device library keeps one copy per workout by the same rule the analysis uses.
export { copyOfDigest, workoutKey, outranks } from './duplicates'
export type { Copy } from './duplicates'

export type { DeferredFailure, SyncItem, SyncSink } from './sessionSync'
export type { FileId, HeldFiles } from './importHeld'

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
    _settings: AthleteSettings,
    onProgress?: (filesRead: number) => void,
    sink?: SyncSink,
    syncExisting = false,
    onComplete?: (outcome: ImportCompletion) => void,
    onActivity?: ActivityListeners['kept'],
    onReplaced?: ActivityListeners['replaced'],
    held?: HeldFiles,
  ): Promise<void> {
    if (this.isSample) this.clear()
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
      const hiddenIds = new Set([...hidden].map((digest) => digest.id))
      for (const { key, code } of await sink.finish(hiddenIds))
        markUnsynced(this.keeping, key, code)
    }
    const visibleNew = [...batch.added].filter(([, digest]) => !hidden.has(digest))
    const added = visibleNew.filter(([key]) => !batch.upgraded.has(key)).map(([, digest]) => digest)
    const upgraded = visibleNew
      .filter(([key]) => batch.upgraded.has(key))
      .map(([, digest]) => digest)
    const visible = analysable.filter((digest) => !hidden.has(digest))
    const files = sortRead(read, new Set([...added, ...upgraded]), visible)
    onComplete?.({
      ...outcome,
      ...files,
      added,
      upgraded,
      ...(listedTypes.size === 0 ? {} : { listedTypes }),
      ...(Object.keys(skippedTypes).length === 0 ? {} : { skippedTypes }),
      ...(companion === null || companion.named === 0
        ? {}
        : { listed: { named: companion.named, received: companion.received } }),
      ...(hints.needsList ? { needsList: true as const } : {}),
    })
  }

  async addFiles(...args: Parameters<AnalysisSession['importFiles']>): Promise<SessionState> {
    await this.importFiles(...args)
    return this.state(args[1])
  }

  /** The ids of the digests the analysis hides as copies of a better one, as the library stands now. */
  hiddenIds(): Set<string> {
    const analysable = this.library.analysable().map(([, digest]) => digest)
    return new Set([...hiddenDigests(analysable)].map((digest) => digest.id))
  }

  /** The id of the digest held under each workout key, in the order given; undefined for a key that is not held. */
  heldIds(keys: readonly string[]): (string | undefined)[] {
    return keys.map((key) => this.library.digests.get(key)?.id)
  }

  /**
   * Moves one saved workout to a digest rebuilt from its original file, without building state: the digest
   * leaves `readable` or `heldOut` for the map its revision calls for. A workout the library holds at the
   * same or a higher rank than the new digest (another copy already current) is left as it is. Says whether it moved.
   * The page hears of it with the next state, so a rebuild of thousands does not analyse thousands of times.
   */
  replaceDigest(key: string, digest: ActivityDigest): boolean {
    const held = this.library.digests.get(key) ?? this.library.notCurrent(key)
    if (held !== undefined && readRank(held) >= readRank(digest)) return false
    this.library.put(key, digest)
    return true
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

  /** Removes one saved workout after its owner-scoped server deletion succeeds; builds no state. */
  dropActivity(sport: Sport, startMs: number): void {
    const key = workoutKey(sport, startMs)
    this.library.drop(key)
    clearUnsynced(this.keeping, key)
  }

  removeActivity(sport: Sport, startMs: number, settings: AthleteSettings): SessionState {
    this.dropActivity(sport, startMs)
    return this.state(settings)
  }

  /** A save ended after the import that left it waiting: the workout is no longer on the unsaved list. */
  markSaved(key: string): void {
    clearUnsynced(this.keeping, key)
  }

  /** Whether a saved workout is held out of the analysis for being made by an older model. */
  hasOutdated(sport: Sport, startMs: number): boolean {
    return this.library.heldOut.get(workoutKey(sport, startMs))?.status === 'stale'
  }

  /**
   * Replaces the library with digests stored elsewhere. With `keepUnsaved`, for a server library, an
   * activity whose save failed stays and stays unsaved, so adding its file again retries it, unless
   * the server holds that workout. A library read from this browser leaves them out. Builds no state.
   */
  replaceLibrary(
    digests: ActivityDigest[],
    { keepUnsaved = false }: { keepUnsaved?: boolean } = {},
  ): void {
    const before = new Map(this.library.digests)
    this.resetLibrary()
    for (const digest of digests) {
      const key = workoutKey(digest.sport, digest.startMs)
      // The copy the analysis reads most wins, whatever the order. A key that arrives both stale and newer is one row held back.
      const kept = this.library.digests.get(key) ?? this.library.notCurrent(key)
      if (kept === undefined || readRank(kept) < readRank(digest)) this.library.put(key, digest)
    }
    if (keepUnsaved) keepUnsavedFrom(this.keeping, before)
  }

  loadDigests(
    digests: ActivityDigest[],
    settings: AthleteSettings,
    options: { keepUnsaved?: boolean } = {},
  ): SessionState {
    this.replaceLibrary(digests, options)
    return this.state(settings)
  }

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

  /** The run splits of a held activity, for its activity page. Null when it has none or is not held. */
  splitsOf(id: string): DigestSplits | null {
    for (const digest of [...this.library.digests.values(), ...this.library.readable.values()])
      if (digest.id === id) return digest.splits ?? null
    return null
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
        rejected: this.rejected.map(({ file }) => file),
        unsupportedFiles: this.unsupported.files,
        outdatedActivities: this.library.countHeldOut('stale'),
        incompatibleActivities: this.library.countHeldOut('newer'),
        libraryActivities: this.library.size,
        heldOut: this.library.heldOutActivities(),
        syncIssues: countIssues(this.unsynced, this.latestUnsynced),
        nowMs: this.isSample ? this.sampleNowMs : this.clock(),
      },
      athlete,
    )
  }
}
