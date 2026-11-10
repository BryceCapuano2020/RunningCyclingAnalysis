import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { BALANCE_TITLE, goTo, trackErrors, uploadFixtures } from './helpers.js'

const TWO_WORKOUTS = ['one-ride.gpx', 'one-run.tcx']

/** How many copies of results rca-state holds, without making the database where it is missing. */
function copiesKept(page: Page): Promise<number> {
  return page.evaluate(async () => {
    if (!(await indexedDB.databases()).some((database) => database.name === 'rca-state')) return 0
    return new Promise<number>((resolve) => {
      const open = indexedDB.open('rca-state')
      open.onerror = () => resolve(0)
      open.onsuccess = () => {
        const db = open.result
        const count = db.transaction('snapshots').objectStore('snapshots').count()
        count.onsuccess = () => {
          db.close()
          resolve(count.result)
        }
      }
    })
  })
}

test('a reload of a signed-out library shows Balance before the analysis has finished', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await uploadFixtures(page, TWO_WORKOUTS)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  // The copy is kept once the results stand still.
  await expect.poll(() => copiesKept(page)).toBe(1)

  // The analysis runs in a worker; hold its script back, so no live analysis can answer yet.
  let release = (): void => undefined
  const held = new Promise<void>((resolve) => (release = resolve))
  let workerAsked = false
  await page.route(/worker[^/]*\.js(\?.*)?$/, async (route) => {
    workerAsked = true
    await held
    await route.continue()
  })
  await page.reload()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect(page.getByRole('status').filter({ hasText: 'Loading' })).toHaveCount(0)
  // Nothing has been analysed in this page: the results are the last visit's.
  expect(workerAsked).toBe(true)

  release()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  expect(errors).toEqual([])
})

test('Remove all my activities takes the copy of the results with it', async ({ page }) => {
  await page.goto('/')
  await uploadFixtures(page, TWO_WORKOUTS)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect.poll(() => copiesKept(page)).toBe(1)

  await goTo(page, 'Profile')
  await page.getByRole('button', { name: 'Remove all my activities' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove all', exact: true })
    .click()

  await expect.poll(() => copiesKept(page)).toBe(0)
})
