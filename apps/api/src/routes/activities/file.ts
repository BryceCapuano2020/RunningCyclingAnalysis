import { Hono } from 'hono'
import type { AppEnv } from '../../env.ts'
import { HttpError } from '../../errors.ts'
import { contentDisposition } from '../../http.ts'
import { chargeDaily } from '../../budget.ts'
import { currentUser, requireUser, sameOriginReadGuard } from '../../middleware.ts'
import { getOriginalFile } from '../../storage.ts'
import { fileStorageUnavailable, findOwnedActivity } from './shared.ts'

export const fileRoutes = new Hono<AppEnv>()

fileRoutes.get('/:id/file', sameOriginReadGuard, requireUser, async (c) => {
  const { db, deps } = c.var
  const userId = currentUser(c).id
  const row = await findOwnedActivity(db, userId, c.req.param('id'))
  if (!row.fileKey) throw new HttpError(404, 'no_file', 'This activity has no stored file')
  if (!c.env.FILES) throw fileStorageUnavailable()

  const charge = await chargeDaily(c.env.DB, userId, 'fileDownload', deps.now())
  let object: R2ObjectBody | null
  try {
    object = await getOriginalFile(c.env.DB, c.env.FILES, row.fileKey, deps.now)
  } catch (error) {
    await charge.refund()
    throw error
  }
  if (!object) throw new HttpError(404, 'no_file', 'The stored file is missing')

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      // A gzipped original is sent as it is stored: the browser unzips it, and the length is what was stored.
      ...(object.httpMetadata?.contentEncoding === 'gzip' ? { 'content-encoding': 'gzip' } : {}),
      'content-length': String(object.size),
      'content-disposition': contentDisposition(row.fileName),
      'cache-control': 'private, no-store',
    },
  })
})
