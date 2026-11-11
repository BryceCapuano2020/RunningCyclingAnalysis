import { digestActivity } from '../digest/digestActivity'
import { sha256Hex } from '../sha256'
import type { ActivityDigest } from '../types'
import { parseActivityFile } from './index'
import { minimisedForUpload } from './minimise'
import { GARMIN_PARSE_LIMITS, type RejectCode } from './result'

/** What `POST /api/activities` takes for one activity. */
interface CreateBody {
  digest: ActivityDigest
  fileName: string
  fileHash: string
}

export type ServerFileResult =
  /** The JSON text of each create body, as the web client posts it: a figure that is NaN reads as null, as JSON gives it. */
  { ok: true; bodies: string[] } | { ok: false; reason: string; code: RejectCode }

/**
 * Reads one file the server was sent (Garmin's push, docs/design/garmin-sync.md section 2) into the create bodies the
 * browser would have sent for it: the same parse, digest and minimising as an import in the tab, with the same session
 * key and file hash (the SHA-256 of the bytes), under the server's smaller limits. The bodies are JSON text, so the
 * server reads exactly what a browser would have sent. Only FIT is read on the server.
 * The equivalence test in apps/api holds the saved digests equal to the browser's.
 */
export async function createBodiesOfFile(
  bytes: Uint8Array,
  fileName: string,
): Promise<ServerFileResult> {
  if (!/\.fit$/i.test(fileName)) {
    return { ok: false, reason: 'The server reads only FIT files', code: 'not-activity' }
  }
  const fileHash = await sha256Hex(bytes)
  const parsed = parseActivityFile(bytes, fileName, GARMIN_PARSE_LIMITS, { sessionKey: fileHash })
  if (!parsed.ok) return { ok: false, reason: parsed.reason, code: parsed.code }
  return {
    ok: true,
    bodies: parsed.activities.map((activity) => {
      const body: CreateBody = {
        ...minimisedForUpload(digestActivity(activity), fileName),
        fileHash,
      }
      return JSON.stringify(body)
    }),
  }
}
