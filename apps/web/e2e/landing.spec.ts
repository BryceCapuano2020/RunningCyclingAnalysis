import { expect, test } from '@playwright/test'
import {
  LANDING_TITLE,
  edgesOf,
  goTo,
  horizontalOverflow,
  openSample,
  trackErrors,
} from './helpers.js'

test('landing page shows the heading, drop zone and privacy statement without console errors', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  await expect(
    page.getByText('Add FIT, GPX or TCX files, or a Strava or Garmin export zip'),
  ).toBeVisible()
  // The one privacy statement is in the footer.
  await expect(
    page.getByText(/^Your activities stay in this browser, where anyone using it can see them\.$/),
  ).toBeVisible()
  expect(errors).toEqual([])
})

test('landing page and every results page have no horizontal scroll on a phone', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Checked at mobile viewports only')

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  const landing = await horizontalOverflow(page)
  expect(landing.scrollWidth).toBeLessThanOrEqual(landing.innerWidth)

  await openSample(page)
  for (const destination of ['Balance', 'Run', 'Ride', 'Activities', 'Profile'] as const) {
    await goTo(page, destination)
    const results = await horizontalOverflow(page)
    expect(results.scrollWidth).toBeLessThanOrEqual(results.innerWidth)
  }
})

// A landscape phone is a touch screen, so it takes the short-screen layout the touch emulation selects.
test.describe('on a short landscape phone', () => {
  test.use({ hasTouch: true })

  test('Add files and the sample are on the first screen', async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 })
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
    const addFiles = await edgesOf(page.getByRole('button', { name: 'Add files' }))
    expect(addFiles.bottom).toBeLessThanOrEqual(390)
  })
})

test('at 320 by 568 Add files is fully above the fold', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  const addFiles = await edgesOf(page.getByRole('button', { name: 'Add files' }))
  expect(addFiles.bottom).toBeLessThanOrEqual(568)
})

test('at 667 by 375 Add files is fully above the fold', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  const addFiles = await edgesOf(page.getByRole('button', { name: 'Add files' }))
  expect(addFiles.bottom).toBeLessThanOrEqual(375)
})

test('a desktop window under 700 px tall keeps the page spacing of a tall one', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'A phone-sized window is a short phone, which tightens its spacing')
  await page.setViewportSize({ width: 1280, height: 650 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  const gap = await page.locator('.page').evaluate((stack) => getComputedStyle(stack).rowGap)
  expect(gap).toBe('24px')
})
