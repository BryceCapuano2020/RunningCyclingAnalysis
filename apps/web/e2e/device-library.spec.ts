import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  BALANCE_TITLE,
  LANDING_TITLE,
  SAMPLE_BANNER,
  activitiesRows,
  goTo,
  openSample,
  trackErrors,
  uploadFixtures,
} from './helpers.js'

const TWO_WORKOUTS = ['one-ride.gpx', 'one-run.tcx']

/**
 * The analysis worker answers requests in order, and a file chosen while it is busy is queued. A
 * file the app refuses is answered after the library load that starts with the page, so once its
 * notice shows, whatever the library restored is already on screen.
 */
async function settleAfterReload(page: Page): Promise<void> {
  await uploadFixtures(page, ['not-a-fit.fit'])
  await expect(page.getByText('1 file needs a look', { exact: true })).toBeVisible()
}

/** The activities kept in this browser, as the Profile page counts them. */
function keptList(page: Page): Locator {
  return page.getByRole('region', { name: 'Kept in this browser' })
}

test('results from files survive a reload for a signed-out visitor', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await uploadFixtures(page, TWO_WORKOUTS)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)

  await page.reload()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect(await activitiesRows(page)).toHaveCount(2)
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a reload on a deep link stays on it while the kept library restores, once an age is saved', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await uploadFixtures(page, TWO_WORKOUTS)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  // A saved year of birth and sex make the page request its age grades on load, which holds it busy.
  await goTo(page, 'Profile')
  await page.getByLabel('Year of birth').fill('1986')
  await page.getByLabel('Year of birth').press('Enter')
  await page.getByText('Man', { exact: true }).click()
  await goTo(page, 'Run')

  await page.reload()
  // The restored threshold is the page's signal that the kept library has replied. The age grades' trend request
  // was sent at load, before the library read, and the worker answers in order, so it has answered by then. A
  // file chosen here would itself be an import on a deep link, which moves the visitor to Balance by design.
  // The run is too short for a fit but not for an estimate, so the card shows its pace and the one run it rests on.
  const threshold = page.getByRole('region', { name: 'Threshold pace' })
  await expect(threshold).toBeVisible()
  await expect(threshold).toContainText(/From 1 run\. Strongest: \d+ min on /)
  await expect(threshold).toContainText(/\d+:\d{2}/)
  await expect(threshold).not.toContainText(/Best \d+ min|At least/)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Run')
  await expect(page).toHaveURL(/#\/run$/)
  expect(errors).toEqual([])
})

test('removing all activities on the Profile page forgets the results kept for a signed-out visitor', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await uploadFixtures(page, TWO_WORKOUTS)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)

  await goTo(page, 'Profile')
  await page.getByRole('button', { name: 'Remove all my activities' }).click()
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove all', exact: true })
    .click()
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()

  await page.reload()
  await settleAfterReload(page)
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  await goTo(page, 'Profile')
  await expect(keptList(page)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the sample is never kept, so a reload after it shows the landing page', async ({ page }) => {
  const errors = trackErrors(page)
  await openSample(page)

  await page.reload()
  await settleAfterReload(page)

  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  await expect(page.getByText(SAMPLE_BANNER)).toHaveCount(0)
  await goTo(page, 'Profile')
  await expect(keptList(page)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('files added over the sample join the results kept by this browser, without the sample', async ({
  page,
  context,
}) => {
  const errors = trackErrors(page)
  await openSample(page)
  // A second tab keeps a ride while the first still shows the sample, which was never kept.
  const other = await context.newPage()
  const otherErrors = trackErrors(other)
  await other.goto('/')
  await uploadFixtures(other, ['one-ride.gpx'])
  await expect(await activitiesRows(other)).toHaveCount(1)

  await uploadFixtures(page, ['one-run.fit'])

  await expect(await activitiesRows(page)).toHaveCount(2)
  await expect(page.getByText(SAMPLE_BANNER)).toHaveCount(0)
  expect(errors).toEqual([])
  expect(otherErrors).toEqual([])
})

test('the Profile page counts the activities kept in this browser, and deletes none', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await uploadFixtures(page, TWO_WORKOUTS)
  await expect(await activitiesRows(page)).toHaveCount(2)

  await goTo(page, 'Profile')
  const kept = keptList(page)
  await expect(kept.getByText(/^1 run and 1 ride, /)).toBeVisible()
  await expect(kept.getByRole('button')).toHaveCount(0)
  await kept.getByRole('link', { name: 'See them in Activities' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Activities' })).toBeVisible()
  expect(errors).toEqual([])
})

test('deleting one kept activity, from its own page, removes it after a reload', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await uploadFixtures(page, TWO_WORKOUTS)
  const rows = await activitiesRows(page)
  await expect(rows).toHaveCount(2)
  // A row offers no Delete while its page opens; the activity page does.
  await expect(page.getByRole('button', { name: /^Delete / })).toHaveCount(0)

  const name = (await rows.first().getByRole('link').first().textContent()) ?? ''
  await rows.first().getByRole('link').first().click()
  const open = page.getByRole('button', { name: `Delete ${name}`, exact: true })
  await expect(open).toBeVisible()
  await open.click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  // The list replaces the page, and says what was deleted.
  await expect(page.getByRole('heading', { level: 1, name: 'Activities' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Deleted' })).toBeVisible()
  await expect(await activitiesRows(page)).toHaveCount(1)

  await page.reload()

  await expect(await activitiesRows(page)).toHaveCount(1)
  await expect(page.getByRole('link', { name, exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('deleting the last kept activity from its page leaves nothing kept', async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await uploadFixtures(page, ['one-ride.gpx'])
  const rows = await activitiesRows(page)
  await expect(rows).toHaveCount(1)

  await rows.first().getByRole('link').first().click()
  await page.getByRole('button', { name: /^Delete / }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()

  // Nothing is left to analyse, so the page asks for files again, and the notices say what was deleted.
  await expect(page.getByText('Add your files to see this page.')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: /^Deleted / })).toBeVisible()
  await goTo(page, 'Profile')
  await expect(keptList(page)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a sample chosen right after the page loads stays on screen once the account lookup ends', async ({
  page,
}) => {
  const errors = trackErrors(page)
  // The lookup is held until the sample is chosen, so the choice is made while the account loads.
  let releaseLookup!: () => void
  const lookupGate = new Promise<void>((resolve) => {
    releaseLookup = resolve
  })
  await page.route('**/api/me', async (route) => {
    await lookupGate
    await route.continue()
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'See a sample athlete' }).click()
  releaseLookup()

  // The kept library loads after the lookup ends; the sample must still be showing after it.
  await page.waitForTimeout(1000)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  expect(errors).toEqual([])
})
