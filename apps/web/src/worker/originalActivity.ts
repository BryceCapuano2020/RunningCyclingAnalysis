import type { ActivityRecord } from '@rca/contract'
import { parseActivityFile } from '@rca/core/import'
import type { Activity } from '@rca/core/types'
import { downloadActivityFile } from '../api/client'

/**
 * A saved activity's original file, downloaded and read again, with the activity in it that the
 * record's digest was made from. The activity is undefined when the file no longer reads or holds no
 * matching activity.
 */
export async function originalActivity(
  record: ActivityRecord,
  userId: string,
): Promise<{ bytes: Uint8Array; activity: Activity | undefined }> {
  const bytes = await downloadActivityFile(record.id, userId)
  const parsed = parseActivityFile(bytes, record.fileName)
  if (!parsed.ok) return { bytes, activity: undefined }
  const activity = parsed.activities.find(
    (candidate) =>
      candidate.sport === record.digest.sport &&
      Math.round(candidate.startMs / 1000) === Math.round(record.digest.startMs / 1000),
  )
  return { bytes, activity }
}
