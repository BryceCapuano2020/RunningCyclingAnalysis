import { expect, test } from '@playwright/test'
import {
  BALANCE_TITLE,
  apiActivities,
  goTo,
  signInAs,
  uniqueEmail,
  uploadFixtures,
} from './helpers.js'
import type { Page } from '@playwright/test'

/** The account lookup retries at 1, 3 and 10 s; the page must stay put past the last of them. */
const PAST_THE_RETRIES_MS = 15_000

/** How many activities this browser keeps for a signed-out visitor, without creating the database. */
async function deviceLibraryCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const known = await indexedDB.databases()
    if (!known.some((database) => database.name === 'rca-device-library')) return 0
    return new Promise<number>((resolve, reject) => {
      const opening = indexedDB.open('rca-device-library')
      opening.onerror = () => reject(opening.error)
      opening.onsuccess = () => {
        const db = opening.result
        const counting = db.transaction('digests').objectStore('digests').count()
        counting.onsuccess = () => {
          db.close()
          resolve(counting.result)
        }
      }
    })
  })
}

test.describe('with the API unreachable', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort())
  })

  test('a signed-out import runs once, and the page stays where it is', async ({ page }) => {
    const workers: string[] = []
    page.on('worker', (worker) => workers.push(worker.url()))
    await page.goto('/')
    await uploadFixtures(page, ['one-run.tcx', 'one-ride.gpx'])
    // Analysed at once, in this session only, while the lookup is still being retried.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
    await goTo(page, 'Run')

    // Sign-in is reported unavailable at the first failed lookup, so nothing waits on the retries.
    await expect(page.getByText('Sign-in is unavailable right now')).toBeVisible()
    await page.waitForTimeout(PAST_THE_RETRIES_MS)

    await expect(page).toHaveURL(/#\/run$/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Run')
    // One worker for the whole visit: the account check did not restart the analysis.
    expect(workers).toHaveLength(1)
    await goTo(page, 'Activities')
    await expect(page.locator('.activity-list__items > li')).toHaveCount(2)
    // Nobody signed in, so what was analysed meanwhile is kept in this browser, as it was.
    await expect.poll(() => deviceLibraryCount(page)).toBe(2)
  })

  test('the library kept in this browser opens at once on a reload', async ({ page }) => {
    await page.goto('/')
    await uploadFixtures(page, ['one-run.tcx'])
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
    // Kept in this browser once the retries have given up and nobody is signed in.
    await expect.poll(() => deviceLibraryCount(page), { timeout: PAST_THE_RETRIES_MS }).toBe(1)

    await page.reload()

    // Well inside the 14 s the retries take: the kept library does not wait for the API.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE, {
      timeout: 8_000,
    })
    await goTo(page, 'Activities')
    await expect(page.locator('.activity-list__items > li')).toHaveCount(1)
  })
})

test('a sign-in found by a retry takes the files analysed meanwhile, and none reach the device', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await signInAs(page.request, uniqueEmail(), 'Ada Lovelace')
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  // The first lookup fails; the retry after it waits until the files are analysed, then gets through.
  let firstLookupAt: number | null = null
  let release: () => void = () => undefined
  const analysed = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/me', async (route) => {
    // The client tries a failed request again at once; both are part of the first lookup.
    firstLookupAt ??= Date.now()
    if (Date.now() - firstLookupAt < 500) return route.abort()
    await analysed
    return route.continue()
  })

  await page.goto('/')
  await uploadFixtures(page, ['one-run.tcx', 'one-ride.gpx'])
  // Analysed in this session only, while nobody is known to be signed in.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect(page.getByText('Sign-in is unavailable right now')).toBeVisible()
  expect(await deviceLibraryCount(page)).toBe(0)

  release()
  await expect(page.getByRole('button', { name: 'Ada', exact: true })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByText('Saved 2 activities to your library')).toBeVisible({
    timeout: 30_000,
  })
  await goTo(page, 'Activities')
  await expect(page.locator('.activity-list__items > li')).toHaveCount(2)
  expect(await apiActivities(page.request)).toHaveLength(2)
  expect(await deviceLibraryCount(page)).toBe(0)
  // The account loaded in the worker the visit began with.
  expect(workers).toHaveLength(1)
})
