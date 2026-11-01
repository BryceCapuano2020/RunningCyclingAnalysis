import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Me } from '@rca/contract'
import { digestActivity, serializeDigest } from '@rca/core/digest'
import { workoutKey } from '@rca/core/duplicates'
import { parseFit } from '@rca/core/fit'
import { hashedFileName } from '@rca/core/import/minimise'
import { activitiesRows, apiActivities, fixturePath, signInAs, uniqueEmail } from './helpers.js'

const NAME = 'Ada Lovelace'

/**
 * A save an earlier visit began and a closed tab cut short is still in the browser's outbox. The next
 * visit to the same account saves it, so the activity reaches the library without its file again.
 */
test('saves an activity an earlier visit left in the outbox, once the library has loaded', async ({
  page,
}) => {
  await signInAs(page.request, uniqueEmail(), NAME)
  const me = (await (await page.request.get('/api/me')).json()) as Me

  const bytes = await readFile(fixturePath('one-run.fit'))
  const parsed = parseFit(new Uint8Array(bytes), 'one-run.fit')
  if (!parsed.ok) throw new Error(`Could not parse the fixture: ${parsed.reason}`)
  const activity = parsed.activities[0]
  if (!activity) throw new Error('The fixture holds no activity')
  const digest = digestActivity(activity)
  const key = workoutKey(digest.sport, digest.startMs)
  const row = {
    id: `${me.user.id}|${key}`,
    userId: me.user.id,
    key,
    seq: 1,
    digestJson: serializeDigest(digest),
    fileName: 'one-run.fit',
    fileHash: createHash('sha256').update(bytes).digest('hex'),
    attempts: 0,
  }

  // The row is put in as a closed tab leaves it: from a page of this origin that runs no app. With the app open,
  // its library load sends whatever the outbox holds at the moment it looks, so a row written meanwhile is sent or
  // not by timing (this test failed 1 run in 5 under load).
  await page.goto('/robots.txt')
  await page.evaluate(
    (waiting) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('rca-outbox', 1)
        opening.onupgradeneeded = () => {
          const store = opening.result.createObjectStore('rows', { keyPath: 'id' })
          store.createIndex('userId', 'userId')
        }
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const db = opening.result
          const write = db.transaction('rows', 'readwrite')
          write.objectStore('rows').put(waiting)
          write.oncomplete = () => {
            db.close()
            resolve()
          }
          write.onerror = () => reject(write.error)
        }
      }),
    row,
  )
  expect(await apiActivities(page.request)).toHaveLength(0)

  await page.goto('/')

  await expect
    .poll(async () => (await apiActivities(page.request)).length, { timeout: 30_000 })
    .toBe(1)
  await expect(await activitiesRows(page)).toHaveCount(1)
  const [saved] = await apiActivities(page.request)
  // New saves send a hash of the file's name (E7), also one an earlier visit left in the outbox.
  expect(saved?.fileName).toBe(hashedFileName('one-run.fit'))

  // The row is gone once the server has the activity, so a later visit does not send it again.
  const left = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const opening = indexedDB.open('rca-outbox', 1)
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const db = opening.result
          const count = db.transaction('rows').objectStore('rows').count()
          count.onsuccess = () => {
            db.close()
            resolve(count.result)
          }
        }
      }),
  )
  expect(left).toBe(0)
})
