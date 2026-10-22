import { expect, test } from '@playwright/test'
import { LANDING_TITLE, horizontalOverflow, openSample, trackErrors } from './helpers.js'

test('landing page shows the heading, drop zone and privacy statement without console errors', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto('/')

  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  await expect(page.getByText('Drop FIT files or a Strava export zip here')).toBeVisible()
  await expect(page.getByText('Your files never leave this device')).toBeVisible()
  expect(errors).toEqual([])
})

test('landing page and results page have no horizontal scroll on a phone', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Checked at mobile viewports only')

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  const landing = await horizontalOverflow(page)
  expect(landing.scrollWidth).toBeLessThanOrEqual(landing.innerWidth)

  await openSample(page)
  const results = await horizontalOverflow(page)
  expect(results.scrollWidth).toBeLessThanOrEqual(results.innerWidth)
})
