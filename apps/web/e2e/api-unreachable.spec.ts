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
    await uploadFixtures(page, ['one-run.tcx', 'one-ride.gpx'], undefined, { settled: false })
    // Analysed at once, in this session only, while the lookup is still being retried.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
    // Nothing is kept in this browser while the lookup may still find a sign-in.
    expect(await deviceLibraryCount(page)).toBe(0)
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
    await uploadFixtures(page, ['one-run.tcx'], undefined, { settled: false })
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
  await uploadFixtures(page, ['one-run.tcx', 'one-ride.gpx'], undefined, { settled: false })
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

/** Past the last of the lookup's own retries (1, 3 and 10 s), so only the browser's signals can bring it back. */
for (const [signal, send] of [
  ['the browser coming back online', () => window.dispatchEvent(new Event('online'))],
  ['the tab becoming visible', () => document.dispatchEvent(new Event('visibilitychange'))],
] as const) {
  test(`the account is looked up again on ${signal}, with no button pressed`, async ({ page }) => {
    test.setTimeout(60_000)
    await signInAs(page.request, uniqueEmail(), 'Ada Lovelace')
    let down = true
    await page.route('**/api/me', (route) => (down ? route.abort() : route.continue()))
    await page.goto('/')
    await expect(page.getByText('Sign-in is unavailable right now')).toBeVisible()
    await page.waitForTimeout(PAST_THE_RETRIES_MS)

    down = false
    await page.evaluate(send)
    await expect(page.getByRole('button', { name: 'Ada', exact: true })).toBeVisible({
      timeout: 15_000,
    })
  })
}

test('Try again looks the account up once the API is back, with no reload', async ({ page }) => {
  test.setTimeout(60_000)
  await signInAs(page.request, uniqueEmail(), 'Ada Lovelace')
  let down = true
  await page.route('**/api/me', (route) => (down ? route.abort() : route.continue()))
  await page.goto('/')

  // Nothing here is a reload, a focus or an `online` event: only the visitor's own ask brings the account back.
  await expect(page.getByText('Sign-in is unavailable right now')).toBeVisible()
  const retry = page.getByRole('button', { name: 'Try again' })
  await retry.click()
  await expect(page.getByText('Sign-in is unavailable right now')).toBeVisible()
  // A press restarts the lookup's own retries (an immediate second try, then 1, 3 and 10 s), and any of
  // them would find the API back. Let them all fail first, so the second press is the only way back.
  await page.waitForTimeout(PAST_THE_RETRIES_MS)

  down = false
  await retry.click()
  await expect(page.getByRole('button', { name: 'Ada', exact: true })).toBeVisible({
    timeout: 15_000,
  })
  await expect(retry).toBeHidden()
})
