import { expect, test } from '@playwright/test'
import {
  BALANCE_TITLE,
  LANDING_TITLE,
  SETUP_DIALOG_NAME,
  activitiesRows,
  fixturePath,
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

test('the first upload asks for the athlete once, and a later upload after a reload does not', async ({
  page,
}) => {
  await page.goto('/')
  const setup = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('one-run.fit'))
  await expect(setup).toBeVisible()
  await setup.getByRole('button', { name: 'Analyse my files' }).click()
  await expect(setup).toBeHidden()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Add rides to see your balance' }),
  ).toBeVisible()

  // The kept summaries bring the result back on reload, and the next file joins it without a dialog.
  await page.reload()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Add rides to see your balance' }),
  ).toBeVisible()
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('one-ride.gpx'))
  await expect(await activitiesRows(page)).toHaveCount(2)
  await expect(setup).toHaveCount(0)
})

test('the weight entered in the setup dialog is the one the results use', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000)
  // The same export, answered with the default weight in another context, is the baseline.
  const baseline = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
  const defaults = await baseline.newPage()
  await defaults.goto('/')
  await uploadFixtures(defaults, ['sample-export.zip'])
  await expect(defaults.getByRole('heading', { level: 1 })).toHaveText(/leans toward running/, {
    timeout: 30_000,
  })
  const defaultRide = await defaults.getByRole('region', { name: 'Ride', exact: true }).innerText()
  await baseline.close()

  await page.goto('/')
  const setup = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('sample-export.zip'))
  await expect(setup).toBeVisible()
  // The units are imperial by default, so this is 185 lb, about 83.9 kg.
  await setup.getByLabel('Body weight').fill('185')
  await setup.getByRole('button', { name: 'Analyse my files' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/leans toward running/, {
    timeout: 30_000,
  })
  const ride = page.getByRole('region', { name: 'Ride', exact: true })
  await expect(ride).toContainText('W/kg')
  await expect.poll(() => ride.innerText()).not.toBe(defaultRide)
  await goTo(page, 'Profile')
  await expect(page.getByLabel('Body weight')).toHaveValue(/^185(\.0)?$/)
})

test('skipping the setup dialog keeps the default weight', async ({ page }) => {
  await page.goto('/')
  const setup = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('one-run.fit'))
  await expect(setup).toBeVisible()
  await setup.getByLabel('Body weight').fill('185')
  await setup.getByRole('button', { name: 'Skip for now' }).click()

  await expect(setup).toBeHidden()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Add rides to see your balance' }),
  ).toBeVisible()
  await goTo(page, 'Profile')
  // 75 kg, the default, in the imperial units the athlete starts with.
  await expect(page.getByLabel('Body weight')).toHaveValue('165.3')
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
