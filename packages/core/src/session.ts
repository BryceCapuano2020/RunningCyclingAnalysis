import { combine, digestActivity } from './digest'
import { fitnessTrend } from './digest/trend'
import type { TrendPoint } from './digest/trend'
import { MODEL_REVISION } from './digest/modelRevision'
import type { AnalysisResult } from './digest'
import type { FitSource } from './fit'
import { extractFitFiles } from './fit'
import { parseActivityFile } from './import'
import { sampleDataset } from './synthetic'
import { DAY_MS } from './constants'
import { requirePositiveFinite } from './math'
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
  | 'digest-quota'
  | 'database-full'
  | 'activity-conflict'
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
  'digest-quota',
  'database-full',
])

/**
 * Whether a failure ends the import: once the account is signed out or changed, or the saved-analysis
 * storage or the database is full, later saves in the same import would fail the same way, so they
 * are not attempted.
 */
export function haltsImport(code: SyncIssueCode): boolean {
  return HALTING_CODES.has(code)
}

export interface SessionState {
  /** Null until at least one activity has been loaded. */
  result: AnalysisResult | null
  rejected: RejectedFile[]
  /** Activity files in formats this app does not read (e.g. KML) that were skipped. */
  unsupportedFiles: number
  isSample: boolean
  /** Activities analysed or eligible, not counting hidden duplicates, before the period filter. */
  totalActivities: number
  /** Stored activities excluded because their digest model is older than this app's. */
  outdatedActivities: number
  /** Stored activities excluded because their digest model is from a newer app version. */
  incompatibleActivities: number
  /**
   * Saved activities left out of the analysis because a copy of the same workout in a higher format
   * (FIT over TCX over GPX) is saved too. They stay in the library.
   */
  hiddenDuplicates: number
  /** Only activities from the last rangeDays days before the newest one are analysed; null = all. */
  rangeDays: number | null
  /** Activities the sink could not save, by cause, until they are saved or the library is cleared. */
  syncIssues: SyncIssue[]
  /**
   * Weekly fitness trend over the analysed workouts. Ignores the period filter, so it covers the
   * whole library, and it is the same set as the analysis before that filter.
   */
  trend: TrendPoint[]
}

/** What the sink receives for each newly digested activity. */
export interface SyncItem {
  digest: ActivityDigest
  /** The activity file's name inside its source (a zip entry path, or the file name). */
  fileName: string
  /** Lowercase hex SHA-256 of bytes. */
  fileHash: string
  /** The activity file's bytes. The session drops its reference once the sink returns. */
  bytes: Uint8Array
}

export type SyncSink = (item: SyncItem) => Promise<void>

/** An activity file as the sink receives it. */
type ImportedFile = Omit<SyncItem, 'digest'>

/**
 * State shared by the activities of one import: the first halting failure, and the copies skipped
 * because a better format of the same workout is already held.
 */
interface SaveBatch {
  halt: SyncIssueCode | null
  duplicates: RejectedFile[]
}

/** Whether two lists hold the same digest objects in the same order. */
function sameDigests(a: ActivityDigest[], b: ActivityDigest[]): boolean {
  return a.length === b.length && a.every((digest, i) => digest === b[i])
}

/** Format ranks: when copies of one workout exist, the highest-ranked one is analysed. */
const RANK = { fit: 3, tcx: 2, gpx: 1 } as const

/** Two copies start within this many milliseconds to be one workout. */
const NEAR_START_MS = 60_000
/** Durations within this many seconds, or this fraction of the longer one, are the same workout. */
const NEAR_DURATION_S = 60
const NEAR_DURATION_FRACTION = 0.1

/** The fields that decide whether two activities are the same workout. */
interface Workout {
  sport: Sport
  startMs: number
  durationS: number
}

/** The fields that decide which copy of a workout is kept. */
export interface Copy {
  id: string
  rank: number
  hasPower: boolean
  hasHeartRate: boolean
  durationS: number
}

/** The copy of a digest, with its format rank taken from its id. */
export function copyOfDigest(digest: ActivityDigest): Copy {
  return {
    id: digest.id,
    rank: formatRank(digest.id),
    hasPower: digest.powerSource === 'measured',
    hasHeartRate: digest.hasHeartRate,
    durationS: digest.durationS,
  }
}

/** The copy of an activity read from a file, before it is digested. Matches copyOfDigest. */
function copyOfActivity(activity: Activity, fileName: string): Copy {
  return {
    id: activity.id,
    rank: formatRank(fileName),
    hasPower: activity.sport === 'ride' && activity.hasPower,
    hasHeartRate: activity.hasHeartRate,
    durationS: activity.n,
  }
}

/**
 * Whether copy a is richer than copy b: format rank first, then a power meter, heart-rate data and
 * the longer duration. Equally rich copies are not richer than each other.
 */
function richer(a: Copy, b: Copy): boolean {
  if (a.rank !== b.rank) return a.rank > b.rank
  if (a.hasPower !== b.hasPower) return a.hasPower
  if (a.hasHeartRate !== b.hasHeartRate) return a.hasHeartRate
  return a.durationS > b.durationS
}

/**
 * Whether the analysis keeps copy a over copy b: the richer one, and between equally rich copies
 * the smaller id, so the choice does not depend on the order the files arrive in.
 */
export function outranks(a: Copy, b: Copy): boolean {
  if (richer(a, b)) return true
  if (richer(b, a)) return false
  return a.id < b.id
}

/** The same workout exported twice has the same sport and start second. */
export function dedupeKey(sport: Sport, startMs: number): string {
  return `${sport}-${Math.round(startMs / 1000)}`
}

/** The activity file name a digest id was built from: `<startMs>-<fileName>[#index][.part]`. */
function fileNameOf(digestId: string): string {
  return digestId.replace(/^\d+-/, '').replace(/(#\d+)?(\.\d+)?$/, '')
}

/**
 * The format rank of an activity file name, or of a digest id, which begins with the file name.
 * 0 when the name has no FIT, TCX or GPX extension.
 */
function formatRank(name: string): number {
  const extension = /\.(fit|gpx|tcx)(?=(?:#\d+)?(?:\.\d+)?$)/i.exec(name)?.[1]?.toLowerCase()
  switch (extension) {
    case 'fit':
      return RANK.fit
    case 'tcx':
      return RANK.tcx
    case 'gpx':
      return RANK.gpx
    default:
      return 0
  }
}

/** Same sport, starts within a minute, and lasts the same time within 60 s or 10%. */
function isSameWorkout(a: Workout, b: Workout): boolean {
  if (a.sport !== b.sport || Math.abs(a.startMs - b.startMs) > NEAR_START_MS) return false
  const gap = Math.abs(a.durationS - b.durationS)
  return (
    gap <= NEAR_DURATION_S || gap <= NEAR_DURATION_FRACTION * Math.max(a.durationS, b.durationS)
  )
}

/**
 * The digests the analysis leaves out. Near-duplicates link into groups, and links are followed
 * transitively (union-find), so a copy linked to the best one only through another copy is also a
 * copy of that workout. Each group keeps its best copy by outranks and hides the rest. Digests are
 * sorted by start, so each one is compared only with those that start within NEAR_START_MS of it.
 */
function hiddenDigests(digests: ActivityDigest[]): Set<ActivityDigest> {
  const sorted = [...digests].sort((a, b) => a.startMs - b.startMs)
  const parent = sorted.map((_, i) => i)
  const root = (i: number): number => {
    let x = i
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!
      x = parent[x]!
    }
    return x
  }
  let first = 0
  for (let j = 0; j < sorted.length; j++) {
    const later = sorted[j]!
    while (later.startMs - sorted[first]!.startMs > NEAR_START_MS) first++
    for (let i = first; i < j; i++) {
      if (isSameWorkout(sorted[i]!, later)) parent[root(i)] = root(j)
    }
  }
  const best = new Map<number, number>()
  for (let i = 0; i < sorted.length; i++) {
    const group = root(i)
    const current = best.get(group)
    if (
      current === undefined ||
      outranks(copyOfDigest(sorted[i]!), copyOfDigest(sorted[current]!))
    ) {
      best.set(group, i)
    }
  }
  const hidden = new Set<ActivityDigest>()
  sorted.forEach((digest, i) => {
    if (best.get(root(i)) !== i) hidden.add(digest)
  })
  return hidden
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Every file byte array here is backed by a plain ArrayBuffer, never a SharedArrayBuffer.
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
  // The last trend, with the digests and masses it was computed from.
  private trendCache: {
    digests: ActivityDigest[]
    massKg: number
    bikeMassKg: number
    points: TrendPoint[]
  } | null = null

  async addFiles(
    sources: FitSource[],
    settings: AthleteSettings,
    onProgress?: (filesRead: number) => void,
    sink?: SyncSink,
    syncExisting = false,
    onComplete?: (outcome: {
      activities: number
      rejected: number
      duplicates: RejectedFile[]
    }) => void,
  ): Promise<SessionState> {
    if (this.isSample) this.clear()
    const batch: SaveBatch = { halt: null, duplicates: [] }
    let filesRead = 0
    const outcome = { activities: 0, rejected: 0 }
    for (const source of sources) {
      let undecodable = 0
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
        },
      )
      this.unsupported.set(source.name, summary.otherActivityFiles)
      outcome.rejected += summary.otherActivityFiles
      // A corrupt file is already reported under its own name, so do not also call it empty.
      if (summary.fitFiles === 0 && summary.otherActivityFiles === 0 && undecodable === 0) {
        outcome.rejected++
        this.rejected.set(source.name, 'No supported activity files found (FIT, GPX or TCX)')
      }
    }
    onComplete?.({ ...outcome, duplicates: batch.duplicates })
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
    const workout: Workout = {
      sport: activity.sport,
      startMs: activity.startMs,
      durationS: activity.n,
    }
    const candidate = copyOfActivity(activity, file.fileName)
    for (const held of this.digests.values()) {
      if (isSameWorkout(held, workout) && richer(copyOfDigest(held), candidate)) {
        batch.duplicates.push({
          fileName: file.fileName,
          reason: `Same workout as ${fileNameOf(held.id)}`,
        })
        return
      }
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
    const replaces =
      held !== undefined && richer(copyOfActivity(activity, file.fileName), copyOfDigest(held))
    if (
      held !== undefined &&
      !replaces &&
      (sink === undefined || (!this.unsynced.has(key) && !syncExisting))
    )
      return
    const digest = held !== undefined && !replaces ? held : digestActivity(activity)
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

  /**
   * The trend of the visible set. The period does not change it, so it is reused while the digests
   * and both masses are the same, and recomputed when any of them change.
   */
  private trendFor(visible: ActivityDigest[], settings: AthleteSettings): TrendPoint[] {
    const cached = this.trendCache
    if (
      cached !== null &&
      cached.massKg === settings.massKg &&
      cached.bikeMassKg === settings.bikeMassKg &&
      sameDigests(cached.digests, visible)
    ) {
      return cached.points
    }
    const points = fitnessTrend(visible, settings)
    this.trendCache = {
      digests: visible,
      massKg: settings.massKg,
      bikeMassKg: settings.bikeMassKg,
      points,
    }
    return points
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

  /** Null settings only after clear, when the library is empty and nothing needs analysing. */
  private state(settings: AthleteSettings | null): SessionState {
    const all = [...this.digests.values()]
    const hidden = hiddenDigests(all)
    const visible = all.filter((d) => !hidden.has(d))
    let selected = visible
    if (this.rangeDays !== null && visible.length > 0) {
      // Anchored to the newest activity, not today, so an old export still shows its last weeks.
      const newest = visible.reduce((latest, d) => Math.max(latest, d.startMs), -Infinity)
      const cutoff = newest - this.rangeDays * DAY_MS
      selected = visible.filter((d) => d.startMs >= cutoff)
    }
    return {
      result: settings !== null && selected.length > 0 ? combine(selected, settings) : null,
      trend: settings === null ? [] : this.trendFor(visible, settings),
      rejected: [...this.rejected].map(([fileName, reason]) => ({ fileName, reason })),
      unsupportedFiles: [...this.unsupported.values()].reduce((a, b) => a + b, 0),
      isSample: this.isSample,
      totalActivities: visible.length,
      outdatedActivities: this.outdatedKeys.size,
      incompatibleActivities: this.incompatibleKeys.size,
      hiddenDuplicates: hidden.size,
      rangeDays: this.rangeDays,
      syncIssues: this.syncIssues(),
    }
  }
}
