import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { seedBaseline } from './checkinSeed.js'
import {
  BALANCE_TITLE,
  edgesOf,
  firstScreenFoot,
  horizontalOverflow,
  trackErrors,
  uploadFixtures,
} from './helpers.js'

/**
 * "Since your last import" under the fitness card, which sits under the balance (D9e). The first-screen
 * contracts of analysis.spec.ts run on the sample, which shows no row; this runs them with one: a library
 * kept in this browser whose baseline was taken before it had any workout, so the import that made it is
 * what the row tells.
 */

const ROW = '[data-testid="checkin-row"]'

/** A kept library of two workouts and a baseline from before them, loaded fresh. */
async function openWithRow(page: Page): Promise<void> {
  await page.goto('/')
  await uploadFixtures(page, ['one-ride.gpx', 'one-run.tcx'])
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await seedBaseline(page)
  await page.reload()
  await expect(page.locator(ROW)).toBeVisible()
}

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
] as const

for (const size of SIZES) {
  test(`at ${size.width} by ${size.height} the row is 48 px or less, the headline is above it and on the first screen, and nothing overflows`, async ({
    page,
  }) => {
    const errors = trackErrors(page)
    await page.setViewportSize(size)
    await openWithRow(page)
    const row = page.locator(ROW)
    const box = (await row.boundingBox())!
    expect(box.height).toBeLessThanOrEqual(48)
    const rowEdges = await edgesOf(row)
    const headline = await edgesOf(page.getByRole('heading', { level: 1 }))
    expect(rowEdges.top).toBeGreaterThanOrEqual(headline.bottom)
    expect(headline.bottom).toBeLessThanOrEqual(await firstScreenFoot(page))
    const overflow = await horizontalOverflow(page)
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(size.width)
    expect(errors).toEqual([])
  })
}

test('at 320 by 640 the line shows what was added as a label and its value, without cutting either', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await openWithRow(page)
  const label = page.locator(`${ROW} .checkin-row__label`)
  const value = page.locator(`${ROW} .checkin-row__value`)
  await expect(label).toContainText('Added since')
  await expect(value).toContainText(/\d/)
  // The value is whole, and the label on one line keeps clear of it.
  const fits = await value.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
  expect(fits).toBe(true)
  const apart = await page.evaluate((row) => {
    const l = document.querySelector(`${row} .checkin-row__label`)!.getBoundingClientRect()
    const v = document.querySelector(`${row} .checkin-row__value`)!.getBoundingClientRect()
    return l.right <= v.left + 1
  }, ROW)
  expect(apart).toBe(true)
})

test('opening the row shows its panel, and Hide takes the row away for good', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWithRow(page)
  const row = page.locator(ROW)
  await row.locator('summary').click()
  // An import into an empty library sets no new best, so the panel holds only its Hide.
  await expect(row.locator('.checkin-row__panel')).toBeVisible()
  await row.getByRole('button', { name: 'Hide' }).click()
  await expect(row).toHaveCount(0)
  // Opened and hidden is seen: a reload brings no row back.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect(page.locator(ROW)).toHaveCount(0)
})
