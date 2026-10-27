import type { Locator, Page } from '@playwright/test'
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

const TWO_WORKOUTS = ['one-ride.gpx', 'one-run.tcx']

/**
 * The analysis worker answers requests in order, and a file chosen while it is busy is queued. A
 * file the app refuses is answered after the library load that starts with the page, so once its
 * notice shows, whatever the library restored is already on screen.
 */
async function settleAfterReload(page: Page): Promise<void> {
  await uploadFixtures(page, ['not-a-fit.fit'])
  await expect(page.getByText('1 file: 1 needs a look.', { exact: true })).toBeVisible()
}

/** The activities kept in this browser, as the Profile page lists them. */
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
  await expect(page.getByText('Showing a sample athlete')).toHaveCount(0)
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
  await expect(page.getByText('Showing a sample athlete')).toHaveCount(0)
  expect(errors).toEqual([])
  expect(otherErrors).toEqual([])
})

test('deleting one kept activity on the Profile page removes it after a reload', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await uploadFixtures(page, TWO_WORKOUTS)
  await expect(await activitiesRows(page)).toHaveCount(2)

  await goTo(page, 'Profile')
  const kept = keptList(page)
  const deleteButtons = kept.getByRole('button', { name: /^Delete / })
  await expect(deleteButtons).toHaveCount(2)
  const label = await deleteButtons.first().getAttribute('aria-label')
  if (label === null) throw new Error('a kept activity has no delete label')
  await deleteButtons.first().click()
  await kept.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(kept.getByRole('status')).toContainText('Deleted')
  await expect(deleteButtons).toHaveCount(1)

  await page.reload()

  // Counted only once the kept list has loaded again, so the label check cannot pass early.
  await expect(kept.getByRole('button', { name: /^Delete / })).toHaveCount(1)
  await expect(kept.getByRole('button', { name: label, exact: true })).toHaveCount(0)
  await expect(await activitiesRows(page)).toHaveCount(1)
  expect(errors).toEqual([])
})

test('deleting the last kept activity on the Profile page says so and empties the list', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await uploadFixtures(page, ['one-ride.gpx'])
  await expect(await activitiesRows(page)).toHaveCount(1)

  await goTo(page, 'Profile')
  const kept = keptList(page)
  await kept.getByRole('button', { name: /^Delete / }).click()
  await kept.getByRole('button', { name: 'Delete', exact: true }).click()

  await expect(kept.getByRole('status')).toContainText('Deleted')
  await expect(kept.getByText('No saved activities')).toBeVisible()
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
