import { expect, test } from '@playwright/test'
import {
  BALANCE_TITLE,
  LANDING_TITLE,
  activitiesRows,
  goTo,
  openSample,
  trackErrors,
  uploadFixtures,
} from './helpers.js'

/** The charts by the accessible names they are given. The balance meter is named by its sentence. */
const BALANCE_METER = /^(Running|Cycling) ahead by |^Even within the model's range/
const FITNESS = /^Fitness over time\./
const CURVE = /^Running and cycling energy rate by duration\./
const RATIO = /^Running compared with cycling by duration\./
const HEART_RATE = /^Heart rate against energy rate\./
const POWER_ACCURACY = /^Estimated against measured power on climbs\./

test('a sample athlete shows the balance, its charts, the activities and the sample notice', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect(page.getByText('Sample athlete', { exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: BALANCE_METER })).toBeVisible()
  await expect(page.getByRole('img', { name: FITNESS })).toBeVisible()
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing a sample athlete.' }),
  ).toHaveCount(1)

  await goTo(page, 'Run')
  await expect(page.getByRole('img', { name: CURVE })).toBeVisible()
  await goTo(page, 'Ride')
  await expect(page.getByRole('img', { name: CURVE })).toBeVisible()

  await goTo(page, 'Balance')
  await page.getByRole('link', { name: 'How sure is this?' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'How sure is this?' })).toBeVisible()
  await expect(page.getByRole('img', { name: RATIO })).toBeVisible()
  await expect(page.getByRole('img', { name: HEART_RATE })).toBeVisible()
  await expect(page.getByRole('img', { name: POWER_ACCURACY })).toBeVisible()

  await expect(await activitiesRows(page)).toHaveCount(14)
  expect(errors).toEqual([])
})

test('the cross-sport card names the ride behind its effort and opens to every duration', async ({
  page,
}) => {
  await openSample(page)

  const card = page.getByRole('region', { name: /^On foot, your bike is worth / })
  await expect(card.getByRole('link', { name: /^Set on / })).toBeVisible()

  const details = card.locator('details')
  await expect(details).not.toHaveAttribute('open')
  await details.locator('summary').click()
  await expect(details.getByRole('columnheader', { name: 'Cycling effort' })).toBeVisible()
})

test('uploading the Strava export zip shows the results, including its GPX run', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['sample-export.zip'])

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/leans toward running/)
  // Fourteen FIT activities and one GPX run.
  await expect(await activitiesRows(page)).toHaveCount(15)
  await expect(page.getByText(/files? (was|were) skipped/)).toHaveCount(0)
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing a sample athlete' }),
  ).toHaveCount(0)
})

test('uploading a GPX ride and a TCX run shows the results', async ({ page }) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-ride.gpx', 'one-run.tcx'])

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/leans toward|in balance/)
  await expect(await activitiesRows(page)).toHaveCount(2)
  await expect(page.getByText(/could not be used/)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toHaveCount(0)
})

test('uploading a single run names cycling as the missing sport and keeps the run card', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-run.fit'])

  await expect(
    page.getByRole('heading', { level: 1, name: 'Add rides to see your balance' }),
  ).toBeVisible()
  const run = page.getByRole('region', { name: 'Run', exact: true })
  await expect(run).toBeVisible()
  await expect(run.getByText('Threshold pace, estimated')).toBeVisible()
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
  await goTo(page, 'Run')

  const plot = page.locator('[aria-roledescription="chart"]').first()
  await plot.focus()
  await page.keyboard.press('ArrowRight')

  // The toolbar has its own status region, so follow the plot's aria-describedby to its tooltip.
  const tooltipId = await plot.getAttribute('aria-describedby')
  expect(tooltipId).toBeTruthy()
  await expect(page.locator(`[id="${tooltipId}"]`)).toBeVisible()
})

test('start over on the Profile page clears the sample and returns to the landing page', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Profile')
  await page.getByRole('button', { name: 'Start over' }).click()

  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  // The app moves to the landing page's hash only once the result has been cleared.
  await expect(page).toHaveURL(/#\/$/)
  await expect(
    page.getByText('Drop FIT, GPX or TCX files, or a Strava export zip here'),
  ).toBeVisible()
})
