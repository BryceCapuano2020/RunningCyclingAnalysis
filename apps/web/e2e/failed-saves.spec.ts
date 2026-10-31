import { expect, test } from '@playwright/test'
import { apiActivities, signInAs, uniqueEmail, uploadFixtures } from './helpers.js'

/**
 * A save the connection cut short is kept in this browser's outbox and sent again on its own. The notice says so,
 * and the athlete need not add the file again: the connection coming back sends it, and so does "Try again now".
 */
const NOT_SAVED = /not fully saved because the connection dropped/

test.describe('a save the connection dropped', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000)
    await signInAs(page.request, uniqueEmail(), 'Ada Lovelace')
  })

  test('says it saves by itself, and Try again now sends it once the connection is back', async ({
    page,
  }) => {
    let refuse = true
    await page.route('**/api/activities', (route) =>
      refuse && route.request().method() === 'POST' ? route.abort() : route.continue(),
    )
    await page.goto('/')
    await uploadFixtures(page, ['one-run.tcx'])

    const notice = page.getByText(NOT_SAVED)
    await expect(notice).toBeVisible({ timeout: 30_000 })
    await expect(notice).toContainText('saves when the connection returns')
    await expect(notice).not.toContainText('again to retry')
    expect(await apiActivities(page.request)).toHaveLength(0)

    // Still refused: the button tries and the notice stays, so it is not a promise the page cannot keep.
    const retry = page.getByRole('button', { name: 'Try again now' })
    await retry.click()
    await expect(notice).toBeVisible()
    expect(await apiActivities(page.request)).toHaveLength(0)

    refuse = false
    await retry.click()
    await expect.poll(async () => (await apiActivities(page.request)).length).toBe(1)
    await expect(notice).toBeHidden()
  })

  test('sends the save when the browser comes back online, with nobody pressing anything', async ({
    page,
  }) => {
    let refuse = true
    await page.route('**/api/activities', (route) =>
      refuse && route.request().method() === 'POST' ? route.abort() : route.continue(),
    )
    await page.goto('/')
    await uploadFixtures(page, ['one-run.tcx'])
    await expect(page.getByText(NOT_SAVED)).toBeVisible({ timeout: 30_000 })

    refuse = false
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(async () => (await apiActivities(page.request)).length).toBe(1)
    await expect(page.getByText(NOT_SAVED)).toBeHidden()
  })
})
