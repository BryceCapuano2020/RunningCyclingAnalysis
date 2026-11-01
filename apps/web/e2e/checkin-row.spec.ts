import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { seedBaseline } from './checkinSeed.js'
import {
  BALANCE_TITLE,
  edgesOf,
  horizontalOverflow,
  trackErrors,
  uploadFixtures,
} from './helpers.js'

/**
 * "Since your last import" under the fitness card (D9e). The first-screen contracts of analysis.spec.ts run on the sample,
 * which shows no row; this runs them with one: a library kept in this browser whose baseline was taken before it had
 * any workout, so the import that made it is what the row tells.
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

/** The top of the section tabs at a phone width, where they are fixed to the foot of the window. */
async function tabBarTop(page: Page): Promise<number> {
  const tabs = page.locator('.header__tabs')
  expect(await tabs.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
  return (await edgesOf(tabs)).top
}

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
] as const

for (const size of SIZES) {
  test(`at ${size.width} by ${size.height} the row is 48 px or less, the headline is under it and above the tabs, and nothing overflows`, async ({
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
    expect(headline.top).toBeGreaterThanOrEqual(rowEdges.bottom)
    if (size.width < 768) expect(headline.top).toBeLessThan(await tabBarTop(page))
    else expect(headline.top).toBeLessThan(size.height)
    const overflow = await horizontalOverflow(page)
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(size.width)
    expect(errors).toEqual([])
  })
}

test('at 320 by 640 the line says what was added and that nothing moved, without cutting it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await openWithRow(page)
  const line = page.locator(`${ROW} .checkin-row__line`)
  const text = (await line.textContent()) ?? ''
  expect(text).toMatch(/added/)
  // The sentence begins with what was added; whatever is cut is only its end.
  const visibleEnd = await line.evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const last = [...range.getClientRects()].at(-1)
    return {
      clamped: el.scrollHeight > el.clientHeight + 1,
      lines: Math.round(el.clientHeight / 17),
      bottom: last?.bottom ?? 0,
    }
  })
  expect(visibleEnd.lines).toBeLessThanOrEqual(2)
  if (text.includes('Nothing moved')) {
    const shown = await line.evaluate((el) => {
      const node = el.firstChild as Text
      const at = node.data.indexOf('Nothing moved')
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + 'Nothing moved'.length)
      return range.getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom + 1
    })
    expect(shown, text).toBe(true)
  }
})

test('opening the row shows the whole sentence, and Hide takes the row away for good', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWithRow(page)
  const row = page.locator(ROW)
  await row.locator('summary').click()
  await expect(row.locator('.checkin-row__full')).toBeVisible()
  await row.getByRole('button', { name: 'Hide' }).click()
  await expect(row).toHaveCount(0)
  // Opened and hidden is seen: a reload brings no row back.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect(page.locator(ROW)).toHaveCount(0)
})
