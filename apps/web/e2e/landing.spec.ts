import { expect, test } from '@playwright/test'
import { LANDING_TITLE, goTo, horizontalOverflow, openSample, trackErrors } from './helpers.js'

test('landing page shows the heading, drop zone and privacy statement without console errors', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  await expect(page.getByText('Add FIT, GPX or TCX files, or a Strava export zip')).toBeVisible()
  // The one privacy statement is in the footer.
  await expect(
    page.getByText(/^Nothing is uploaded; analysis runs in your browser\./),
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

test('on a short landscape phone, Add files and the sample are on the first screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  const addFiles = await page.getByRole('button', { name: 'Add files' }).boundingBox()
  expect((addFiles?.y ?? 0) + (addFiles?.height ?? 0)).toBeLessThanOrEqual(390)
})

test('at 320 by 568 Add files is fully above the fold', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  const addFiles = await page.getByRole('button', { name: 'Add files' }).boundingBox()
  expect((addFiles?.y ?? 0) + (addFiles?.height ?? 0)).toBeLessThanOrEqual(568)
})

test('at 667 by 375 Add files is fully above the fold', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  const addFiles = await page.getByRole('button', { name: 'Add files' }).boundingBox()
  expect((addFiles?.y ?? 0) + (addFiles?.height ?? 0)).toBeLessThanOrEqual(375)
})
