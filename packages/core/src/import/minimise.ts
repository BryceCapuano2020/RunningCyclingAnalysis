import { fileNameOf } from '../duplicates'
import { sha256TextHex } from '../sha256Sync'
import type { ActivityDigest } from '../types'
import { generatedName } from './names'

/**
 * What a new activity says about its owner beyond the analysis, and what is sent of it (D12 E7, RCA-032). From
 * revision 7:
 * - the file name an activity's id is made from is a hash of it, kept with the format's extension: the name of a Strava
 *   export's file is the activity's number on Strava, and any other file's name is often its title. The id is made so at
 *   import (`hashedFileName` in the pipeline), so the id on this device, in the trace cache and in the account are the
 *   same;
 * - a new activity is sent to the account with a generated name ("Morning Run") unless the athlete chose to send titles,
 *   and with the file name hashed.
 * An activity already saved keeps the id, file name and title it has: a replace or an upgrade sends them as they are, and
 * so does a rebuild (originalActivity.ts), so nothing minimises the past.
 *
 * The hash has no key. A numeric id has few values, so a reader of the library who tries them all can recover it: this
 * keeps the number out of plain sight and out of a join with Strava's, it is not secrecy. The start time is not changed:
 * `workoutKey(sport, startMs)` is the key every workout is matched by, on the device and in the account (the dedupe key
 * of a row), at the second, so a start rounded to the minute would find no row to upgrade and would insert a copy. See
 * docs/PRODUCTION.md, "What is sent of an activity".
 */
export interface UploadPolicy {
  /** The athlete's choice to send the titles of their activities. */
  titles: boolean
}

/** A name this module made: `rca-` and sixteen hex digits, then the format's extension if the file had one. */
const HASHED_NAME = /^rca-[0-9a-f]{16}(\.(?:fit|tcx|gpx))?$/i

/** Whether a name is one `hashedFileName` made. */
export function isHashedFileName(name: string): boolean {
  return HASHED_NAME.test(name)
}

/** The hashed form of a file name, keeping a FIT, TCX or GPX extension so the format still ranks and parses. */
export function hashedFileName(fileName: string): string {
  if (isHashedFileName(fileName)) return fileName
  const extension = /\.(fit|tcx|gpx)$/i.exec(fileName)?.[0].toLowerCase() ?? ''
  return `rca-${sha256TextHex(fileName).slice(0, 16)}${extension}`
}

/** A digest id, `<startMs>-<fileName>[#index][.part]`, with its file name hashed (as it is if it already is). */
export function hashedDigestId(id: string): string {
  const name = fileNameOf(id)
  const prefix = /^\d+-/.exec(id)?.[0] ?? ''
  return `${prefix}${hashedFileName(name)}${id.slice(prefix.length + name.length)}`
}

/**
 * The digest and file name to send for a new activity: the id and the file name hashed, and the title generated unless the
 * account sends titles.
 */
export function minimisedForUpload(
  digest: ActivityDigest,
  fileName: string,
  policy: UploadPolicy,
): { digest: ActivityDigest; fileName: string } {
  return {
    digest: {
      ...digest,
      id: hashedDigestId(digest.id),
      name: policy.titles ? digest.name : generatedName(digest.startMs, digest.sport),
    },
    fileName: hashedFileName(fileName),
  }
}
