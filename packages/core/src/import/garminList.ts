import { DEFAULT_EXTRACT_LIMITS } from '../fit/archive'
import type { ExtractLimits } from '../fit/archive'
import { visitZipEntries } from '../fit/zipEntry'
import type { RangedSource } from '../fit/zipDirectory'
import { ZIP } from '../fit/zipDirectory'
import type { Sport } from '../types'
import { cleanTitle } from './names'

/**
 * The most one of a Garmin export's activity summaries may inflate to. A summary of a few thousand
 * activities is a few megabytes. The text is parsed whole, which takes several times its size, so this
 * is also what bounds that parse.
 */
export const MAX_GARMIN_SUMMARY_BYTES = 8 * 1024 * 1024
/**
 * The most objects one summary may hold, counted before it is parsed. A real summary has a few dozen for
 * each activity, but a crafted list of empty objects is a few bytes for each, and a parsed object takes
 * about a hundred.
 */
export const MAX_GARMIN_SUMMARY_OBJECTS = 500_000
/** The most all of an export's summaries may inflate to together. They are read one at a time. */
export const MAX_GARMIN_SUMMARIES_BYTES = 64 * 1024 * 1024
/** The most summary files read from one export. Garmin splits a large account's summaries into a few. */
const MAX_SUMMARY_FILES = 32
/**
 * How far a summary's start may sit from the start of the activity it names. The summary gives the
 * activity's start to the millisecond; the file's first record is within a second or two of it.
 */
export const START_TOLERANCE_MS = 5000
/** Summaries starting this close together can be told apart only by their sport. */
export const TIE_MS = 1000
/** Epoch values below this are seconds, not milliseconds (it is the year 1973 in milliseconds). */
const SECONDS_BELOW = 1e11

/**
 * The summaries of a Garmin Connect export, as the export lays them out: the zip holds a DI_CONNECT folder,
 * and in it DI-Connect-Fitness holds files such as `<account>_0_summarizedActivities.json`. The activity
 * files themselves are in zips under DI-Connect-Uploaded-Files, so they are named by upload, not by
 * activity: the only way to a name is the start time. Matched without its case, with "/" or "\\".
 */
const SUMMARY_PATH = /(^|[\\/])DI-Connect-Fitness[\\/][^\\/]*summarizedActivities[^\\/]*\.json$/i

/** What a Garmin export's summary says about one activity. A blank name and an unknown type are left out. */
export interface GarminActivity {
  startMs: number
  name?: string
  /** The sport its activityType names, when it names a run or a ride. */
  sport?: Sport
}

/** A Garmin export's activities by start time, to name the files of the export by theirs. */
export interface GarminList {
  /** In start order, and for the same start in name order, whatever order the summaries came in. */
  activities: readonly GarminActivity[]
  /**
   * The name of the activity that started within START_TOLERANCE_MS of `startMs`, the nearest first. When
   * more than one started that close to each other (TIE_MS), the one whose type is the file's sport; when
   * that still leaves two with different names, none.
   */
  nameAt(startMs: number, sport: Sport): string | undefined
  /** The bytes the summaries inflated to. They count against the export's decompressed-bytes budget. */
  decompressedBytes: number
}

/**
 * The activities a summary file lists. The file is a list holding an object with a `summarizedActivitiesExport`
 * list of activities, as Garmin writes it; the object alone or the bare list of activities are read too.
 * The start is `startTimeGmt`, else `beginTimestamp`, in epoch milliseconds. An entry with no start is left
 * out. A name is cut to a title as any is (cleanTitle). Null when the text is not JSON.
 */
export function parseGarminSummaries(text: string): GarminActivity[] | null {
  if (objectsIn(text) > MAX_GARMIN_SUMMARY_OBJECTS) return []
  let root: unknown
  try {
    root = JSON.parse(text)
  } catch {
    return null
  }
  const activities: GarminActivity[] = []
  for (const entry of activityEntries(root)) {
    const startMs = startOf(entry)
    if (startMs === undefined) continue
    const name = cleanTitle(typeof entry.name === 'string' ? entry.name : undefined)
    const sport = sportOf(entry.activityType)
    activities.push({
      startMs,
      ...(name === undefined ? {} : { name }),
      ...(sport === undefined ? {} : { sport }),
    })
  }
  return activities
}

/** How many objects the text opens, at most one more than the limit. */
function objectsIn(text: string): number {
  let count = 0
  for (let at = text.indexOf('{'); at >= 0; at = text.indexOf('{', at + 1)) {
    if (++count > MAX_GARMIN_SUMMARY_OBJECTS) break
  }
  return count
}

/** The objects that may be activities: those under `summarizedActivitiesExport`, else the list's own. */
function activityEntries(root: unknown): Record<string, unknown>[] {
  const exported = (value: unknown): unknown[] | undefined =>
    isRecord(value) && Array.isArray(value.summarizedActivitiesExport)
      ? value.summarizedActivitiesExport
      : undefined
  const candidates =
    exported(root) ?? (Array.isArray(root) ? root.flatMap((v) => exported(v) ?? [v]) : [])
  return candidates.filter(isRecord)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function startOf(entry: Record<string, unknown>): number | undefined {
  for (const value of [entry.startTimeGmt, entry.beginTimestamp]) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value < SECONDS_BELOW ? Math.round(value * 1000) : Math.round(value)
    }
  }
  return undefined
}

/**
 * The sport a Garmin activityType names: a string such as "running" or "indoor_cycling", or an object
 * holding it as `typeKey`. Only a run or a ride is a sport here, and an e-bike ride is neither.
 */
function sportOf(type: unknown): Sport | undefined {
  const key = isRecord(type) ? type.typeKey : type
  if (typeof key !== 'string') return undefined
  const words = key.toLowerCase().replace(/[\s_-]+/g, ' ')
  if (/\be ?bike|\bebike/.test(words)) return undefined
  if (/\brun/.test(words)) return 'run'
  if (/\b(cycling|biking|bike|ride)\b/.test(words)) return 'ride'
  return undefined
}

/** A list of activities, searched by start. Pass the activities of every summary of the export. */
export function garminList(activities: GarminActivity[], decompressedBytes = 0): GarminList {
  const sorted = [...activities].sort(
    (a, b) =>
      a.startMs - b.startMs ||
      (a.name ?? '').localeCompare(b.name ?? '') ||
      (a.sport ?? '').localeCompare(b.sport ?? ''),
  )
  return {
    activities: sorted,
    decompressedBytes,
    nameAt(startMs, sport) {
      const near = nearTo(sorted, startMs)
      const best = near[0]
      if (best === undefined) return undefined
      // The summaries too close to the nearest to be told from it by their time.
      const tied = near.filter((a) => Math.abs(a.startMs - best.startMs) <= TIE_MS)
      if (tied.length === 1) return best.name
      const ofSport = tied.filter((a) => a.sport === sport)
      // The sport picks among them when it can. Several that agree on the name are not ambiguous.
      const names = new Set((ofSport.length > 0 ? ofSport : tied).map((a) => a.name))
      return names.size === 1 ? [...names][0] : undefined
    },
  }
}

/** The activities that started within the tolerance of an instant, nearest first, then in list order. */
function nearTo(sorted: readonly GarminActivity[], startMs: number): GarminActivity[] {
  let low = 0
  let high = sorted.length
  while (low < high) {
    const mid = (low + high) >> 1
    if (sorted[mid]!.startMs < startMs - START_TOLERANCE_MS) low = mid + 1
    else high = mid
  }
  const near: GarminActivity[] = []
  for (let i = low; i < sorted.length && sorted[i]!.startMs <= startMs + START_TOLERANCE_MS; i++) {
    near.push(sorted[i]!)
  }
  // A stable sort, so equal distances stay in list order.
  return near.sort((a, b) => Math.abs(a.startMs - startMs) - Math.abs(b.startMs - startMs))
}

/**
 * The activity summaries of a Garmin Connect export zip, read without reading the activity files, so the
 * names are known before any file is parsed. Null when the source is not a zip, is larger than
 * limits.maxSourceBytes, or holds no summary. The summaries are read one at a time, each parsed and let
 * go before the next is inflated, and together they inflate to at most MAX_GARMIN_SUMMARIES_BYTES, of
 * the export's decompressed-bytes budget, and of its buffer (see visitZipEntries). A summary past its
 * share or not JSON is left out; what it took is still counted. Never throws.
 */
export async function readGarminList(
  source: RangedSource,
  limits: ExtractLimits = DEFAULT_EXTRACT_LIMITS,
): Promise<GarminList | null> {
  if (!ZIP.test(source.name) || source.size > limits.maxSourceBytes) return null
  const summaryLimits = {
    ...limits,
    maxEntryBytes: Math.min(limits.maxEntryBytes, MAX_GARMIN_SUMMARY_BYTES),
  }
  const share = {
    maxBytes: Math.min(MAX_GARMIN_SUMMARIES_BYTES, limits.maxTotalDecompressedBytes),
    maxEntries: MAX_SUMMARY_FILES,
  }
  const activities: GarminActivity[] = []
  const visited = await visitZipEntries(
    source,
    (name) => SUMMARY_PATH.test(name),
    summaryLimits,
    share,
    ({ bytes }) => {
      const listed = parseGarminSummaries(new TextDecoder().decode(bytes))
      // A summary can list no more activities than the export may hold files.
      for (const activity of listed ?? []) {
        if (activities.length < limits.maxArchiveEntries) activities.push(activity)
      }
    },
  )
  return visited.inflatedBytes === 0 && visited.read === 0
    ? null
    : garminList(activities, visited.inflatedBytes)
}
