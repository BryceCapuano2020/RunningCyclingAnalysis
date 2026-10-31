import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import {
  apiActivities,
  enableFileRetention,
  fixturePath,
  signInAs,
  uniqueEmail,
  uploadFixtures,
} from './helpers.js'

/**
 * Through the real Worker runtime (wrangler), not the unit tests' stand-in: the original is sent gzipped, stored and counted
 * gzipped, and comes back as the very file, with the runtime not compressing the stored bytes a second time.
 */
test('an original is stored gzipped, counted at the size stored, and downloads as the file it was', async ({
  page,
}) => {
  await signInAs(page.request, uniqueEmail(), 'Ada Lovelace')
  await enableFileRetention(page.request)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Ada', exact: true })).toBeVisible()
  await uploadFixtures(page, ['one-run.tcx'])
  await expect
    .poll(async () => (await apiActivities(page.request))[0]?.hasFile, { timeout: 30_000 })
    .toBe(true)

  const [record] = await apiActivities(page.request)
  const original = await readFile(fixturePath('one-run.tcx'))
  expect(record?.fileSize).toBeGreaterThan(0)
  expect(record?.fileSize).toBeLessThan(original.byteLength)

  const download = await page.request.get(`/api/activities/${record!.id}/file`)
  expect(download.status()).toBe(200)
  expect(download.headers()['content-encoding']).toBe('gzip')
  expect(Buffer.from(await download.body()).equals(original)).toBe(true)
})
