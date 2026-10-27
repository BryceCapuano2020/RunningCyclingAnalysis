import { countActivityFiles, extractFitFiles } from './fit'
import type { ExtractLimits, FitFile, RangedSource } from './fit'
import { ACTIVITY } from './fit/zipDirectory'
import { parseActivityFile } from './import'
import { listedFor, listedOnly, readActivityList } from './import/activitiesCsv'
import type { ListedActivity } from './import/activitiesCsv'
import { fileNameOf, isSameWorkout } from './duplicates'
import { sha256Hex } from './sha256'
import type { Activity, ActivityDigest } from './types'
import type { Rejection } from './import/result'
import type { RejectedFile } from './sessionState'

/** The files an import has read so far, across all of its sources, and the progress callback. */
export interface ImportProgress {
  filesRead: number
  onProgress?: (filesRead: number) => void
}

/** A refused file, with the source it came from, so a clean read takes back only a refusal of its own source. */
export interface Refused {
  source: number
  file: RejectedFile
}

/** What became of one activity: the digest it added to the library, or the name of the held file it duplicates. */
export type Considered = { added: ActivityDigest } | { held: string }

/** What became of one file's activities: the digests it added, and the held files the others duplicate. */
export interface ReadFile {
  fileName: string
  added: ActivityDigest[]
  held: string[]
}

/** What one import records as it reads one of its sources. */
export interface SourceImport {
  limits: ExtractLimits
  progress: ImportProgress
  /** The position of this source among the import's sources. */
  source: number
  /**
   * The activities read, the files refused and the files left out unread. A file whose activities
   * were read is in `read`, and `rejected` counts exactly the files in `refused` and the unreadable
   * formats.
   */
  outcome: { activities: number; rejected: number; notActivities: number }
  /**
   * The refused files, in the order they were refused, shared by the import. Every refusal is listed,
   * including two files of one name. A file read cleanly takes back the refusals of its own source
   * under its name, and under its name with .gz, and no other.
   */
  refused: Refused[]
  /** The files whose activities were read, in the order they were read, shared by the import. */
  read: ReadFile[]
  /** The activity files the sources hold in formats the app does not read, which are counted, not listed. */
  unsupported: { files: number }
  /** Whether each file's bytes are hashed, which the sink needs. */
  hashFiles: boolean
  /** Considers one parsed activity of an imported file. */
  consider: (
    activity: Activity,
    file: { fileName: string; fileHash: string; bytes: Uint8Array },
  ) => Promise<Considered>
}

/**
 * The upload's hash, which its legs share as their session key, so two uploads of one name are two
 * sessions. Where crypto.subtle is unavailable, as on an origin that is not secure (a phone reached over
 * http on a LAN), there is no hash: the legs then share no session, and the import still reads.
 */
export async function sessionHashOf(bytes: Uint8Array): Promise<string | undefined> {
  if ((globalThis.crypto as Crypto | undefined)?.subtle === undefined) return undefined
  return sha256Hex(bytes)
}

/** Lists a refused file, and counts it. */
function reject(ctx: SourceImport, fileName: string, rejection: Rejection): void {
  const { reason, code, detail, listed } = rejection
  ctx.refused.push({ source: ctx.source, file: { fileName, reason, code, detail, listed } })
  ctx.outcome.rejected++
}

/**
 * Takes back the refusals of this source under the name of each file it read cleanly, and under that
 * name with .gz. Only those of its own source: a different file that shares a name stays refused. It
 * is done once the source has been read, so the order of its entries does not decide it.
 */
function takeBack(ctx: SourceImport, files: readonly ReadFile[]): void {
  const names = new Set(files.flatMap(({ fileName }) => [fileName, `${fileName}.gz`]))
  for (let i = ctx.refused.length - 1; i >= 0; i--) {
    const { source, file } = ctx.refused[i]!
    if (source !== ctx.source || !names.has(file.fileName)) continue
    ctx.refused.splice(i, 1)
    ctx.outcome.rejected--
  }
}

/** Counts one more file as read, and reports the count. */
function countRead(progress: ImportProgress): void {
  progress.filesRead++
  progress.onProgress?.(progress.filesRead)
}

/** Parses one activity file of a source, given what the export's list says of it, and considers its activities. */
async function importFile(
  file: FitFile,
  listed: ListedActivity | undefined,
  ctx: SourceImport,
): Promise<void> {
  const sessionKey = await sessionHashOf(file.bytes)
  const parsed = parseActivityFile(file.bytes, file.fileName, undefined, {
    activityName: listed?.name,
    activityType: listed?.type,
    sessionKey,
  })
  if (parsed.ok) {
    ctx.outcome.activities += parsed.activities.length
    // A kept file is hashed as it always was, reusing the session key's hash when one was made.
    const fileHash = ctx.hashFiles ? (sessionKey ?? (await sha256Hex(file.bytes))) : ''
    const imported = { fileName: file.fileName, fileHash, bytes: file.bytes }
    const result: ReadFile = { fileName: file.fileName, added: [], held: [] }
    for (const activity of parsed.activities) {
      const considered = await ctx.consider(activity, imported)
      if ('added' in considered) result.added.push(considered.added)
      else result.held.push(considered.held)
    }
    ctx.read.push(result)
  } else {
    reject(ctx, parsed.fileName, parsed)
  }
  countRead(ctx.progress)
}

/**
 * Sorts the files an import read, once it has ended, into those that added a workout and those that
 * did not. A file added one when a digest it added is among the visible digests the import added, so
 * the order the files arrive in does not matter and a new activity hidden as a copy does not count.
 * Every other file is one entry of `duplicates`, which names the held file its workout is in, or else
 * the visible copy of it, or else the file itself.
 */
export function sortRead(
  read: readonly ReadFile[],
  visibleAdded: ReadonlySet<ActivityDigest>,
  visibleLibrary: readonly ActivityDigest[],
): { filesAdded: number; duplicates: RejectedFile[] } {
  const duplicates: RejectedFile[] = []
  let filesAdded = 0
  for (const { fileName, added, held } of read) {
    if (added.some((digest) => visibleAdded.has(digest))) {
      filesAdded++
      continue
    }
    const copy = added[0] && visibleLibrary.find((digest) => isSameWorkout(digest, added[0]!))
    const detail = held[0] ?? (copy ? fileNameOf(copy.id) : fileName)
    duplicates.push({ fileName, reason: `Same workout as ${detail}`, code: 'duplicate', detail })
  }
  return { filesAdded, duplicates }
}

/**
 * Imports one source (a file, or a zip and every activity file in it) into the import's state. The
 * source's activity list is read before its files, and its inflated bytes count against the source's
 * decompressed-bytes budget. When the list names the export's activities, the other activity files of
 * the zip, such as saved routes, are left unread and counted as not activities.
 */
export async function importSource(source: RangedSource, ctx: SourceImport): Promise<void> {
  const { progress, outcome } = ctx
  let undecodable = 0
  const readBefore = progress.filesRead
  const filesBefore = ctx.read.length
  // The export's list is read before its files, which may sit anywhere in the zip. The list's
  // inflated bytes count against the source's decompressed-bytes budget, as the files' do.
  const list = await readActivityList(source, ctx.limits)
  const listed = await listedOnly(source, ctx.limits, list)
  const extractLimits = {
    ...ctx.limits,
    maxTotalDecompressedBytes:
      ctx.limits.maxTotalDecompressedBytes - (list?.decompressedBytes ?? 0),
  }
  const summary = await extractFitFiles(
    source,
    (file) => importFile(file, listedFor(list?.files, file.fileName), ctx),
    (fileName, rejection) => {
      undecodable++
      reject(ctx, fileName, rejection)
      // An activity file that could not be read was still read, so progress reaches its total.
      if (ACTIVITY.test(fileName)) countRead(progress)
    },
    extractLimits,
    listed,
  )
  takeBack(ctx, ctx.read.slice(filesBefore))
  // An archive that stops early, or loses an entry, reports nothing for the files it did not
  // reach. They count as read here, up to the total its directory lists.
  const expected = (await countActivityFiles([source], ctx.limits, listed)) ?? 0
  for (let left = expected - (progress.filesRead - readBefore); left > 0; left--)
    countRead(progress)
  ctx.unsupported.files += summary.otherActivityFiles
  outcome.rejected += summary.otherActivityFiles
  outcome.notActivities += summary.notActivities
  // A corrupt file is already reported under its own name, so do not also call it empty.
  if (summary.fitFiles === 0 && summary.otherActivityFiles === 0 && undecodable === 0) {
    reject(ctx, source.name, {
      reason: 'No supported activity files found (FIT, GPX or TCX)',
      code: 'not-activity',
    })
  }
}
