import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
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

/** The charts by their figure titles. The balance meter is named by its sentence. */
const BALANCE_METER =
  /^(Running|Cycling) (grades \d+ points? higher|\d+% higher)|^In balance: |^Even within the model's range/
/** The Balance trend: one chart for both sports, as age grades when the age and sex are known. */
const BALANCE_TREND = /^(Age grade|Energy rate) of your best 20 minutes, trailing/
const RUN_CURVE = /^Running flat pace per (kilometre|mile) by duration$/
const RIDE_CURVE = /^Cycling power in watts by duration$/
const ENERGY_SCALE = /^Running and cycling energy rate \(metabolic W\/kg\) by duration$/
const RATIO = /^Running compared with cycling by duration$/
const HEART_RATE = /^Heart rate against energy rate$/
const POWER_ACCURACY = /^Estimated against measured power on climbs$/

/** Opens one section's "Show the evidence" disclosure on How sure is this?, so its chart is shown. */
async function showEvidence(page: Page, section: string): Promise<void> {
  await page.locator('summary', { hasText: `Show the evidence for the ${section}` }).click()
}

test('a sample athlete shows the balance, its charts, the activities and the sample notice', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect(
    page.getByRole('status').filter({ hasText: 'Showing a sample athlete' }),
  ).toBeVisible()
  await expect(page.getByRole('img', { name: BALANCE_METER })).toBeVisible()
  await expect(page.getByRole('figure', { name: BALANCE_TREND })).toBeVisible()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Showing a sample athlete, a 37-year-old man at 75 kg.' }),
  ).toHaveCount(1)

  await goTo(page, 'Run')
  await expect(page.getByRole('figure', { name: RUN_CURVE })).toBeVisible()
  await goTo(page, 'Ride')
  await expect(page.getByRole('figure', { name: RIDE_CURVE })).toBeVisible()

  await goTo(page, 'Balance')
  await page.getByRole('main').getByRole('link', { name: 'How sure is this?' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'How sure is this?' })).toBeVisible()
  // A closed disclosure hides its chart, in every browser, until the reader opens it.
  await expect(page.locator('details.method__evidence').first()).not.toHaveAttribute('open')
  await expect(page.getByRole('figure', { name: RATIO })).toBeHidden()
  await showEvidence(page, 'energy view')
  await expect(page.getByRole('figure', { name: ENERGY_SCALE })).toBeVisible()
  await expect(page.getByRole('figure', { name: RATIO })).toBeVisible()
  await showEvidence(page, 'heart-rate check')
  await expect(page.getByRole('figure', { name: HEART_RATE })).toBeVisible()
  await showEvidence(page, 'virtual power meter')
  await expect(page.getByRole('figure', { name: POWER_ACCURACY })).toBeVisible()

  await expect(await activitiesRows(page)).toHaveCount(14)
  expect(errors).toEqual([])
})

test('the cross-sport card names the ride behind its effort and opens to every duration', async ({
  page,
  isMobile,
}) => {
  await openSample(page)

  const card = page.getByRole('region', { name: /^On foot, your ride is worth / })
  await expect(card.getByRole('link', { name: /^Set on / })).toBeVisible()

  const details = card.locator('details')
  await expect(details).not.toHaveAttribute('open')
  await details.locator('summary').click()
  // A phone shows the efforts as a list, and a wider screen as a table.
  const rideEffort = isMobile
    ? details.getByRole('term').filter({ hasText: 'Ride effort' }).first()
    : details.getByRole('columnheader', { name: 'Ride effort' })
  await expect(rideEffort).toBeVisible()
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
    page.getByRole('heading', { level: 1, name: 'Add a ride to see your balance' }),
  ).toBeVisible()

  // The kept summaries bring the result back on reload, and the next file joins it without a dialog.
  await page.reload()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Add a ride to see your balance' }),
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
  // The same export, answered with a different weight in another context, is the baseline.
  const baseline = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
  const defaults = await baseline.newPage()
  await defaults.goto('/')
  await uploadFixtures(defaults, ['sample-export.zip'], '165')
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

test('skipping the weight holds the balance until one is entered, and asks for it', async ({
  page,
}) => {
  await page.goto('/')
  const setup = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('sample-export.zip'))
  await expect(setup).toBeVisible()
  await setup.getByRole('button', { name: 'Skip for now' }).click()

  // Both sports are on file, so the balance waits for the ride's weight; the run still shows.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Your balance waits for your weight',
    { timeout: 30_000 },
  )
  await expect(
    page.locator('p.lede', { hasText: 'Add your weight on Profile to compare a ride with a run.' }),
  ).toBeVisible()
  await expect(page.getByRole('region', { name: 'Run', exact: true })).toBeVisible()
})

test('skipping the setup dialog keeps a weight typed before it, as a valid answer', async ({
  page,
}) => {
  await page.goto('/')
  const setup = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('one-run.fit'))
  await expect(setup).toBeVisible()
  // Imperial by default, so this is 185 lb, about 83.9 kg: inside the typical range, so it is kept.
  await setup.getByLabel('Body weight').fill('185')
  await setup.getByRole('button', { name: 'Skip for now' }).click()

  await expect(setup).toBeHidden()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Add a ride to see your balance' }),
  ).toBeVisible()
  await goTo(page, 'Profile')
  await expect(page.getByLabel('Body weight')).toHaveValue(/^185(\.0)?$/)
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rca.preferences.v1') ?? 'null'),
  )
  expect(stored?.setupDone).toBe(true)
  expect(stored?.settings?.massKg).toBeCloseTo(185 * 0.45359237, 3)
})

test('skipping the setup dialog with nothing typed leaves the weight unset', async ({ page }) => {
  await page.goto('/')
  const setup = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('one-run.fit'))
  await expect(setup).toBeVisible()
  await setup.getByRole('button', { name: 'Skip for now' }).click()

  await expect(setup).toBeHidden()
  await goTo(page, 'Profile')
  // Nothing was typed, so the field is empty and says what a weight is for.
  await expect(page.getByLabel('Body weight')).toHaveValue('')
  await expect(
    page.getByText('Not entered. Add your weight to compare a ride with a run.'),
  ).toBeVisible()
  // The skip is recorded as answered, with no weight saved.
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rca.preferences.v1') ?? 'null'),
  )
  expect(stored?.setupDone).toBe(true)
  expect(stored?.settings?.massKg ?? null).toBeNull()
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
  await expect(page.getByText(/^\d+ files? skipped\.$/)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toHaveCount(0)
})

test('uploading a single run names cycling as the missing sport and keeps the run card', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-run.fit'])

  await expect(
    page.getByRole('heading', { level: 1, name: 'Add a ride to see your balance' }),
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

  await expect(page.getByText('1 file skipped.', { exact: true })).toBeVisible()
  await page.getByText('1 file skipped.', { exact: true }).click()
  await expect(page.getByText('Damaged or empty: 1 file')).toBeVisible()
  // The first skipped file is named above the list, so a lone file is named once and not listed again.
  await expect(page.getByText(/not-a-fit\.fit/)).toHaveCount(1)
  await expect(page.getByText(/not-a-fit\.fit/)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
})

test('a chart plot responds to the arrow keys with a tooltip', async ({ page }) => {
  await openSample(page)
  await goTo(page, 'Run')

  const plot = page.locator('[aria-roledescription="chart"]').first()
  await plot.focus()
  await page.keyboard.press('ArrowRight')

  // The plot is described by its tooltip and its arrow-key hint. The toolbar has its own status region,
  // so the tooltip is found by its id, and the hint must resolve to an element of its own.
  const described = ((await plot.getAttribute('aria-describedby')) ?? '').split(' ')
  const tooltipId = described.find((id) => id.endsWith('-tooltip'))
  const hintId = described.find((id) => id.endsWith('-hint'))
  expect(tooltipId).toBeTruthy()
  expect(hintId).toBeTruthy()
  await expect(page.locator(`[id="${tooltipId}"]`)).toBeVisible()
  await expect(page.locator(`[id="${hintId}"]`)).toHaveCount(1)
})

test('removing all activities on the Profile page clears the sample and returns to the landing page', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Profile')
  await page.getByRole('button', { name: 'Remove all my activities' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear', exact: true }).click()

  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  // The app moves to the landing page's hash only once the result has been cleared.
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByText('Add FIT, GPX or TCX files, or a Strava export zip')).toBeVisible()
})

test('a record link opened from Run keeps the Run tab lit and offers Back to Run', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Run')

  await page
    .getByRole('region', { name: 'Best efforts' })
    .locator('a.records__link')
    .first()
    .click()

  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(BALANCE_TITLE)
  await expect(
    page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Run', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Back to Run', exact: true })).toBeVisible()
})
