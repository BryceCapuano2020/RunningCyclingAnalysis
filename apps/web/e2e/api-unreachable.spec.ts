import { expect, test } from '@playwright/test'
import { BALANCE_TITLE, goTo, uploadFixtures } from './helpers.js'

/** The account lookup retries at 1, 3 and 10 s; the page must stay put past the last of them. */
const PAST_THE_RETRIES_MS = 15_000

test.describe('with the API unreachable', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/**', (route) => route.abort())
  })

  test('a signed-out import runs once, and the page stays where it is', async ({ page }) => {
    const workers: string[] = []
    page.on('worker', (worker) => workers.push(worker.url()))
    await page.goto('/')
    await uploadFixtures(page, ['one-run.tcx', 'one-ride.gpx'])
    await expect(page.getByRole('button', { name: 'Dismiss summary' })).toBeVisible()
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
  })

  test('the library kept in this browser opens at once on a reload', async ({ page }) => {
    await page.goto('/')
    await uploadFixtures(page, ['one-run.tcx'])
    await expect(page.getByRole('button', { name: 'Dismiss summary' })).toBeVisible()

    await page.reload()

    // Well inside the 14 s the retries take: the kept library does not wait for the API.
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE, {
      timeout: 8_000,
    })
    await goTo(page, 'Activities')
    await expect(page.locator('.activity-list__items > li')).toHaveCount(1)
  })
})
