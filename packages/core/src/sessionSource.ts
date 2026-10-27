import { countActivityFiles, extractFitFiles } from './fit'
import type { ExtractLimits, FitFile, RangedSource } from './fit'
import { ACTIVITY } from './fit/zipDirectory'
import { parseActivityFile } from './import'
import { listedFor, listedOnly, readActivityList } from './import/activitiesCsv'
import type { ListedActivity } from './import/activitiesCsv'
import { sha256Hex } from './sha256'
import type { Activity } from './types'
import type { Rejection } from './import/result'
import type { RejectedFile } from './sessionState'

/** The files an import has read so far, across all of its sources, and the progress callback. */
export interface ImportProgress {
  filesRead: number
  onProgress?: (filesRead: number) => void
}

/** What one import records as it reads its sources. */
export interface SourceImport {
  limits: ExtractLimits
  progress: ImportProgress
  /**
   * The activities read, and the files by what became of them: `filesAdded` kept an activity,
   * `rejected` were refused, and `notActivities` were left out unread. A file whose activities were
   * all copies of held workouts is in none of these: it is in `duplicates`.
   */
  outcome: { activities: number; filesAdded: number; rejected: number; notActivities: number }
  /**
   * The refused files, in the order they were refused, shared by the import. Every refusal is listed,
   * including two files of one name, and `outcome.rejected` counts exactly these and the unreadable
   * formats. A file read cleanly takes back the refusals under its name.
   */
  rejected: RejectedFile[]
  /** The files whose activities were all copies of workouts already held, one entry for each file. */
  duplicates: RejectedFile[]
  /** The activity files the sources hold in formats the app does not read, which are counted, not listed. */
  unsupported: { files: number }
  /** Whether each file's bytes are hashed, which the sink needs. */
  hashFiles: boolean
  /**
   * Considers one parsed activity of an imported file. Gives the name of the held file it is a copy
   * of, or null when it was kept.
   */
  consider: (
    activity: Activity,
    file: { fileName: string; fileHash: string; bytes: Uint8Array },
  ) => Promise<string | null>
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
  ctx.rejected.push({ fileName, reason, code, detail, listed })
  ctx.outcome.rejected++
}

/** Takes back the refusals under a file's name, and under its name with .gz, since the file read cleanly. */
function takeBack(ctx: SourceImport, fileName: string): void {
  for (let i = ctx.rejected.length - 1; i >= 0; i--) {
    const name = ctx.rejected[i]!.fileName
    if (name !== fileName && name !== `${fileName}.gz`) continue
    ctx.rejected.splice(i, 1)
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
    const copies: string[] = []
    for (const activity of parsed.activities) {
      const copyOf = await ctx.consider(activity, imported)
      if (copyOf !== null) copies.push(copyOf)
    }
    countFile(ctx, file.fileName, copies, parsed.activities.length)
    takeBack(ctx, file.fileName)
  } else {
    reject(ctx, parsed.fileName, parsed)
  }
  countRead(ctx.progress)
}

/**
 * Counts a read file once. It is added when any of its activities was kept, and already added when
 * every one was a copy of a held workout. The copies inside an added file are not counted.
 */
function countFile(
  ctx: SourceImport,
  fileName: string,
  copies: string[],
  activities: number,
): void {
  if (copies.length < activities) {
    ctx.outcome.filesAdded++
    return
  }
  const copyOf = copies[0]
  ctx.duplicates.push({
    fileName,
    reason: `Same workout as ${copyOf}`,
    code: 'duplicate',
    detail: copyOf,
  })
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
