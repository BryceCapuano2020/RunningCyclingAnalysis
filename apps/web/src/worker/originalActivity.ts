import type { ActivityRecord } from '@rca/contract'
import { parseActivityFile } from '@rca/core/import'
import { sha256Hex } from '@rca/core/sha256'
import type { Activity } from '@rca/core/types'
import { downloadActivityFile } from '../api/client'

/**
 * A saved activity's original file, downloaded and read again, with the activity in it that the
 * record's digest was made from. The activity is undefined when the file no longer reads or holds no
 * matching activity. The file's hash is its upload's, which the legs of the upload share as their
 * session key, so it is computed once here and returned for the rebuild to store the file under.
 */
export async function originalActivity(
  record: ActivityRecord,
  userId: string,
): Promise<{ fileHash: string; activity: Activity | undefined }> {
  const bytes = await downloadActivityFile(record.id, userId)
  const fileHash = await sha256Hex(bytes)
  const parsed = parseActivityFile(bytes, record.fileName, undefined, { sessionKey: fileHash })
  if (!parsed.ok) return { fileHash, activity: undefined }
  const activity = parsed.activities.find(
    (candidate) =>
      candidate.sport === record.digest.sport &&
      Math.round(candidate.startMs / 1000) === Math.round(record.digest.startMs / 1000),
  )
  return { fileHash, activity }
}
