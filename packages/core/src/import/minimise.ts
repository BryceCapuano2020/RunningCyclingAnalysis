import { hasRevision7 } from '../digest/revision7Gate'
import { fileNameOf } from '../duplicates'
import { sha256Hex } from '../sha256'
import type { ActivityDigest } from '../types'
import { generatedName } from './names'

/**
 * What a digest says about its owner beyond the analysis, and what is sent of it (D12 E7, RCA-032). From revision 7 a
 * digest is sent to the account with:
 * - its title only if the athlete chose to send titles; otherwise a generated name ("Morning Run");
 * - the file's name replaced by a hash of it, keeping the format's extension, because the name of a Strava export's
 *   file is the activity's number on Strava, and any other file's name is often its title;
 * - the digest's id rebuilt from the same hashed name.
 * The start time is not changed (see docs/PRODUCTION.md: a start rounded to the minute would change the key every
 * workout is matched by).
 *
 * The hash is of the account and the name, so it is the same on every device and every upload of one file (a replace, a
 * resumed save, a rebuild all find the activity), and differs between accounts. A numeric id has few values, so a reader
 * of the library who is also willing to try them all can still recover it: this keeps the number out of plain sight, it
 * is not secrecy. A name already hashed is left as it is, so a rebuild of a stored activity does not hash it again.
 */
export interface UploadPolicy {
  /** The athlete's choice to send the titles of their activities. */
  titles: boolean
  /** Who the hash belongs to: the account's id. */
  account: string
}

/** A name this module made: `rca-` and sixteen hex digits, then the format's extension if the file had one. */
const HASHED_NAME = /^rca-[0-9a-f]{16}(\.(?:fit|tcx|gpx))?$/i

/** The hashed form of a file name, keeping a FIT, TCX or GPX extension so the format still ranks. */
export async function hashedFileName(fileName: string, account: string): Promise<string> {
  if (HASHED_NAME.test(fileName)) return fileName
  const extension = /\.(fit|tcx|gpx)$/i.exec(fileName)?.[0].toLowerCase() ?? ''
  const hash = await sha256Hex(new TextEncoder().encode(`${account}\u0000${fileName}`))
  return `rca-${hash.slice(0, 16)}${extension}`
}

/** A digest id, `<startMs>-<fileName>[#index][.part]`, with its file name hashed. */
async function hashedId(id: string, account: string): Promise<string> {
  const name = fileNameOf(id)
  const prefix = /^\d+-/.exec(id)?.[0] ?? ''
  const suffix = id.slice(prefix.length + name.length)
  return `${prefix}${await hashedFileName(name, account)}${suffix}`
}

/**
 * The digest and file name to send to the account. A digest below revision 7 is sent as it is, so nothing changes
 * until the release that writes revision 7.
 */
export async function minimisedForUpload(
  digest: ActivityDigest,
  fileName: string,
  policy: UploadPolicy,
): Promise<{ digest: ActivityDigest; fileName: string }> {
  if (!hasRevision7(digest.modelRevision)) return { digest, fileName }
  return {
    digest: {
      ...digest,
      id: await hashedId(digest.id, policy.account),
      name: policy.titles ? digest.name : generatedName(digest.startMs, digest.sport),
    },
    fileName: await hashedFileName(fileName, policy.account),
  }
}
