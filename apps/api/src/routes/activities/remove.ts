import { Hono } from 'hono'
import type { AppEnv } from '../../env.ts'
import { HttpError } from '../../errors.ts'
import { chargeDaily } from '../../budget.ts'
import { currentUser, requireUser } from '../../middleware.ts'
import { activityFileKey, recordDatabaseSize } from '../../storage.ts'
import { findOwnedActivity } from './shared.ts'

export const removeRoutes = new Hono<AppEnv>()

removeRoutes.delete('/:id', requireUser, async (c) => {
  const { db, deps } = c.var
  const userId = currentUser(c).id
  const row = await findOwnedActivity(db, userId, c.req.param('id'))
  if (!c.env.FILES && (row.fileKey !== null || row.fileSize !== null)) {
    throw new HttpError(
      503,
      'file_storage_unavailable',
      'Original files must be available before this activity can be deleted',
    )
  }
  await chargeDaily(c.env.DB, userId, 'activityDelete', deps.now())

  // The row goes first, in the same transaction that lowers the stored counter. The object follows.
  // An upload that finishes after this sees no row and removes its own object.
  const [, removed] = await c.env.DB.batch([
    // The refund reads the stored digest size before the next statement deletes the row.
    c.env.DB.prepare(
      `UPDATE users SET activity_count = activity_count - 1,
         digest_bytes = digest_bytes - (SELECT length(CAST(digest_json AS BLOB)) FROM activities
           WHERE id = ? AND user_id = ?)
       WHERE id = ? AND EXISTS (SELECT 1 FROM activities WHERE id = ? AND user_id = ?)`,
    ).bind(row.id, userId, userId, row.id, userId),
    c.env.DB.prepare('DELETE FROM activities WHERE id = ? AND user_id = ? RETURNING file_key').bind(
      row.id,
      userId,
    ),
  ])
  const deletedRows = (removed?.results ?? []) as { file_key: string | null }[]
  if (deletedRows.length === 0) throw new HttpError(404, 'not_found', 'Activity not found')
  // The delete may bring the database back under its soft limit, so the create guard reads it.
  if (removed) await recordDatabaseSize(c.env.DB, deps.now(), removed.meta.size_after)

  if (c.env.FILES) {
    const keys = new Set([activityFileKey(userId, row.id)])
    const captured = deletedRows[0]?.file_key
    if (captured) keys.add(captured)
    try {
      await c.env.FILES.delete([...keys])
    } catch {
      // The row is gone, so the object is now unreachable. The scheduled sweep removes it after
      // its grace period; the caller's delete has succeeded.
      console.error(
        JSON.stringify({
          event: 'activity_object_left_for_sweep',
          requestId: c.res.headers.get('X-Request-ID'),
        }),
      )
    }
  }
  return c.body(null, 204)
})
