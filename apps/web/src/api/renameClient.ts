import { ActivityRenameResultSchema } from '@rca/contract'
import type { ActivityRenameResult } from '@rca/contract'
import { readJson, request } from './client'

/**
 * Sets the name of one saved activity, in place. The server keeps it as the athlete's own, so a rebuilt digest of the
 * same file does not bring the file's name back. The answer is the name as the server holds it, trimmed.
 */
export async function renameActivity(
  id: string,
  name: string,
  userId?: string,
): Promise<ActivityRenameResult> {
  const response = await request(
    'PATCH',
    `/api/activities/${encodeURIComponent(id)}/name`,
    { json: { name } },
    userId,
  )
  return readJson(response, ActivityRenameResultSchema)
}
