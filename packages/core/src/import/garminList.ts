import { DEFAULT_EXTRACT_LIMITS } from '../fit/archive'
import type { ExtractLimits } from '../fit/archive'
import { readZipEntries } from '../fit/zipEntry'
import type { RangedSource } from '../fit/zipDirectory'
import { ZIP } from '../fit/zipDirectory'

/**
 * The most one of a Garmin export's activity summaries may hold once inflated. A summary of a few
 * thousand activities is a few megabytes; it bounds the text one file inflates to.
 */
export const MAX_GARMIN_SUMMARY_BYTES = 32 * 1024 * 1024
/** The most summary files read from one export. Garmin splits a large account's summaries into a few. */
const MAX_SUMMARY_FILES = 32
/**
 * How far a summary's start may sit from the start of the activity it names. The summary gives the
 * activity's start to the millisecond; the file's first record is within a second or two of it.
 */
export const START_TOLERANCE_MS = 5000
/** Epoch values below this are seconds, not milliseconds (it is the year 1973 in milliseconds). */
const SECONDS_BELOW = 1e11

/**
 * The summaries of a Garmin Connect export, as the export lays them out: the zip holds a DI_CONNECT folder,
 * and in it DI-Connect-Fitness holds files such as `<account>_0_summarizedActivities.json`. The activity
 * files themselves are in zips under DI-Connect-Uploaded-Files, so they are named by upload, not by
 * activity: the only way to a name is the start time. Matched without its case, with "/" or "\\".
 */
const SUMMARY_PATH = /(^|[\\/])DI-Connect-Fitness[\\/][^\\/]*summarizedActivities[^\\/]*\.json$/i

/** What a Garmin export's summary says about one activity. A blank name is left out. */
export interface GarminActivity {
  startMs: number
  name?: string
}

/** A Garmin export's activities by start time, to name the files of the export by theirs. */
export interface GarminList {
  /** In start order. */
  activities: readonly GarminActivity[]
  /** The name of the activity that started within START_TOLERANCE_MS of `startMs`, the nearest first. */
  nameAt(startMs: number): string | undefined
  /** The bytes the summaries inflated to. They count against the export's decompressed-bytes budget. */
  decompressedBytes: number
}

/**
 * The activities a summary file lists. The file is a list holding an object with a `summarizedActivitiesExport`
 * list of activities, as Garmin writes it; the object alone or the bare list of activities are read too.
 * The start is `startTimeGmt`, else `beginTimestamp`, in epoch milliseconds. An entry with no start is left
 * out. Null when the text is not JSON.
 */
export function parseGarminSummaries(text: string): GarminActivity[] | null {
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
    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    activities.push(name === '' ? { startMs } : { startMs, name })
  }
  return activities
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

/** A list of activities, searched by start. Pass the activities of every summary of the export. */
export function garminList(activities: GarminActivity[], decompressedBytes = 0): GarminList {
  const sorted = [...activities].sort((a, b) => a.startMs - b.startMs)
  return {
    activities: sorted,
    decompressedBytes,
    nameAt(startMs) {
      // Binary search for the first activity at or after the start, then the nearer of it and the one before.
      let low = 0
      let high = sorted.length
      while (low < high) {
        const mid = (low + high) >> 1
        if (sorted[mid]!.startMs < startMs) low = mid + 1
        else high = mid
      }
      const near = [sorted[low - 1], sorted[low]].filter(
        (a): a is GarminActivity =>
          a !== undefined && Math.abs(a.startMs - startMs) <= START_TOLERANCE_MS,
      )
      near.sort((a, b) => Math.abs(a.startMs - startMs) - Math.abs(b.startMs - startMs))
      return near[0]?.name
    },
  }
}

/**
 * The activity summaries of a Garmin Connect export zip, read without reading the activity files, so the
 * names are known before any file is parsed. Null when the source is not a zip, is larger than
 * limits.maxSourceBytes, or holds no readable summary. A summary that is not JSON, or that inflates past
 * MAX_GARMIN_SUMMARY_BYTES or past the export's decompressed-bytes budget, is left out, but the bytes it
 * inflated to are still counted. Never throws.
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
  const files = await readZipEntries(
    source,
    (name) => SUMMARY_PATH.test(name),
    summaryLimits,
    limits.maxTotalDecompressedBytes,
    MAX_SUMMARY_FILES,
  )
  if (files.length === 0) return null
  const activities: GarminActivity[] = []
  let decompressedBytes = 0
  for (const { bytes } of files) {
    decompressedBytes += bytes.length
    const listed = parseGarminSummaries(new TextDecoder().decode(bytes))
    if (listed === null) continue
    // A summary can list no more activities than the export may hold files.
    for (const activity of listed) {
      if (activities.length < limits.maxArchiveEntries) activities.push(activity)
    }
  }
  return garminList(activities, decompressedBytes)
}
