import type { ActivityRecord } from '@rca/contract'
import { parseActivityFile } from '@rca/core/import'
import { sha256Hex } from '@rca/core/sha256'
import type { Activity, ActivityDigest } from '@rca/core/types'
import { downloadActivityFile } from '../api/client'

/**
 * The type an export's list gave the activity, as far as the saved digest shows it. A file that names
 * no sport, such as an old Strava GPX file, was read by that type, so it is read the same way again.
 */
function savedType({ sport, indoor }: ActivityDigest): string {
  const type = sport === 'run' ? 'Run' : 'Ride'
  return indoor ? `Virtual ${type}` : type
}

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
  const parsed = parseActivityFile(bytes, record.fileName, undefined, {
    activityType: savedType(record.digest),
    sessionKey: fileHash,
  })
  if (!parsed.ok) return { fileHash, activity: undefined }
  const activity = parsed.activities.find(
    (candidate) =>
      candidate.sport === record.digest.sport &&
      Math.round(candidate.startMs / 1000) === Math.round(record.digest.startMs / 1000),
  )
  return { fileHash, activity }
}
