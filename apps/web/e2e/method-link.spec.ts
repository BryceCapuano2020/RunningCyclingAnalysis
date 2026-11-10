import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { openSample } from './helpers.js'

/** How far the heading's top may sit from the line under the sticky header, in CSS pixels. */
const TOLERANCE_PX = 4

/** Waits until the scroll position holds for several frames, so a late scroll has landed. */
async function scrollSettled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = scrollY
        let still = 0
        let frames = 0
        const tick = () => {
          frames += 1
          still = scrollY === last ? still + 1 : 0
          last = scrollY
          if (still >= 10 || frames > 240) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )
}

/** The heading's top edge, less the height the sticky header covers: zero when it sits just under the header. */
async function offsetUnderHeader(page: Page, id: string): Promise<number> {
  return page.evaluate((target) => {
    const heading = document.getElementById(target)
    if (heading === null) throw new Error(`No heading ${target}`)
    const clearance = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
    return heading.getBoundingClientRect().top - clearance
  }, id)
}

test('a Method link in Details lands with its section heading at the top, focused', async ({
  page,
}) => {
  await openSample(page)
  const ride = page.getByRole('article', { name: 'Functional threshold power' })
  await ride.locator('summary', { hasText: 'Details' }).click()
  await ride.getByRole('link', { name: /^Method/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Method' })).toBeVisible()

  const heading = page.getByRole('heading', { level: 2, name: 'Thresholds and race times' })
  await expect(heading).toBeFocused()
  await scrollSettled(page)
  const id = await heading.getAttribute('id')
  expect(Math.abs(await offsetUnderHeader(page, id!))).toBeLessThanOrEqual(TOLERANCE_PX)
})

test('a contents entry on Method lands with its section heading at the top', async ({ page }) => {
  await page.goto('/#/method')
  await page
    .getByRole('navigation', { name: 'On this page' })
    .getByRole('button', { name: 'Heart-rate check' })
    .click()
  const heading = page.getByRole('heading', { level: 2, name: 'Heart-rate check' })
  await expect(heading).toBeFocused()
  await scrollSettled(page)
  const id = await heading.getAttribute('id')
  expect(Math.abs(await offsetUnderHeader(page, id!))).toBeLessThanOrEqual(TOLERANCE_PX)
})
