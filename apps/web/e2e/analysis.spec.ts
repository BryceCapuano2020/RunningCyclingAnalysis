import { expect, test } from '@playwright/test'
import {
  LANDING_TITLE,
  activitiesRows,
  openSample,
  trackErrors,
  uploadFixtures,
} from './helpers.js'

test('try sample data shows the results, four charts, the activities and the sample notice', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/running|cycling/i)
  await expect(page.locator('figure [role="img"]')).toHaveCount(4)
  await expect(activitiesRows(page)).toHaveCount(14)
  await expect(page.getByText('You are looking at simulated sample data')).toBeVisible()
  expect(errors).toEqual([])
})

test('uploading the Strava export zip shows the results, including its GPX run', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['sample-export.zip'])

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /Over .* your running is estimated to use .* more energy rate per kg than your cycling/,
  )
  // Fourteen FIT activities and one GPX run.
  await expect(activitiesRows(page)).toHaveCount(15)
  await expect(page.getByText(/files? (was|were) skipped/)).toHaveCount(0)
  await expect(page.getByText('You are looking at simulated sample data')).toHaveCount(0)
})

test('uploading a GPX ride and a TCX run shows the results', async ({ page }) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-ride.gpx', 'one-run.tcx'])

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    /Over .*, your (running|cycling) is estimated to use .* more energy rate per kg than your (running|cycling)|Your running and cycling energy estimates overlap/,
  )
  await expect(activitiesRows(page)).toHaveCount(2)
  await expect(page.getByText(/could not be used/)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toHaveCount(0)
})

test('uploading a single run names cycling as the missing sport', async ({ page }) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-run.fit'])

  await expect(
    page.getByRole('heading', { level: 1, name: 'Add at least one run and one ride' }),
  ).toBeVisible()
  await expect(page.getByText(/no cycling activities yet/)).toBeVisible()
})

test('uploading a file that is not FIT lists it as unusable and keeps the landing page', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['not-a-fit.fit'])

  await expect(page.getByText('1 file could not be used', { exact: true })).toBeVisible()
  await page.getByText('1 file could not be used', { exact: true }).click()
  await page.getByText('Not a FIT file: 1 file').click()
  await expect(page.getByText('not-a-fit.fit')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
})

test('a chart plot responds to the arrow keys with a tooltip', async ({ page }) => {
  await openSample(page)

  const plot = page.locator('[aria-roledescription="chart"]').first()
  await plot.focus()
  await page.keyboard.press('ArrowRight')

  // The toolbar has its own status region, so follow the plot's aria-describedby to its tooltip.
  const tooltipId = await plot.getAttribute('aria-describedby')
  expect(tooltipId).toBeTruthy()
  await expect(page.locator(`[id="${tooltipId}"]`)).toBeVisible()
})

test('start over returns to the landing page', async ({ page }) => {
  await openSample(page)
  await page.getByRole('button', { name: 'Start over' }).click()

  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  await expect(
    page.getByText('Drop FIT, GPX or TCX files, or a Strava export zip here'),
  ).toBeVisible()
})
