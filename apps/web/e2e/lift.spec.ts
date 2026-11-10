import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  BALANCE_TITLE,
  LANDING_TITLE,
  appSettled,
  goTo,
  openSample,
  signInAs,
  trackErrors,
  uniqueEmail,
  uploadFixtures,
} from './helpers.js'

/** Chooses a lift in the picker by typing part of its name and taking the option that matches. */
async function chooseLift(page: Page, typed: string, option: string | RegExp): Promise<void> {
  const box = page.getByRole('combobox', { name: 'Lift' })
  await box.fill(typed)
  await page.getByRole('option', { name: option, exact: true }).click()
}

/** Fills the open form and saves: reps, load and effort. */
async function saveSet(page: Page, reps: string, load: string, rpe?: string): Promise<void> {
  await page.getByLabel('Reps').fill(reps)
  await page.getByLabel('Load', { exact: true }).fill(load)
  if (rpe !== undefined) await page.getByLabel('Effort (RPE)').selectOption(rpe)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
}

test('the rail says Lift and the page says Lifting', async ({ page }) => {
  await openSample(page)
  await goTo(page, 'Lift')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lifting')
  await expect(page.getByText('No sets')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log a set' })).toBeVisible()
})

test('logs, edits and deletes sets, adds a custom lift, and keeps them across a reload', async ({
  page,
}) => {
  const errors = trackErrors(page)
  // Signed out with no files there is no rail, so the page is opened by its address.
  await page.goto('/#/lift')
  await appSettled(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lifting')

  await page.getByRole('button', { name: 'Log a set' }).click()
  // One primary button on screen: the form's Save, with "Log a set" not drawn.
  await expect(page.getByRole('button', { name: 'Log a set' })).toHaveCount(0)
  await chooseLift(page, 'back squat', 'Back squat')
  await saveSet(page, '5', '225', '8')
  await saveSet(page, '3', '225', '9')
  await page.getByRole('button', { name: 'Done' }).click()

  await expect(page.getByRole('heading', { name: 'Back squat, barbell' })).toBeVisible()
  await expect(page.getByText(/× 5 · RPE 8/)).toBeVisible()
  await expect(page.getByText(/× 3 · RPE 9/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Edit set / })).toHaveCount(2)

  await page.getByRole('button', { name: 'Edit set 2' }).click()
  await page.getByLabel('Reps').fill('4')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(/× 4 · RPE 9/)).toBeVisible()
  await expect(page.getByText(/× 3 · RPE 9/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit set 2' })).toBeFocused()

  // Done on an edit puts focus back on that row's button.
  await page.getByRole('button', { name: 'Edit set 2' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: 'Edit set 2' })).toBeFocused()

  // A delete moves focus to the next row: the set that was second is first now.
  await page.getByRole('button', { name: 'Edit set 1' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('button', { name: /^Edit set / })).toHaveCount(1)
  await expect(page.getByText(/× 5 · RPE 8/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit set 1' })).toBeFocused()

  // Deleting the last row of a lift with more sets moves focus to the lift's heading.
  await page.getByRole('button', { name: 'Log a set' }).click()
  await chooseLift(page, 'back squat', 'Back squat')
  await saveSet(page, '6', '225', '7')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Edit set 2' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('button', { name: /^Edit set / })).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Back squat, barbell' })).toBeFocused()

  await page.getByRole('button', { name: 'Log a set' }).click()
  await chooseLift(page, 'zercher hold', 'Add ‘Zercher hold’')
  await saveSet(page, '8', '40')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: /^Zercher hold, / })).toBeVisible()

  await page.reload()
  await appSettled(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lifting')
  await expect(page.getByRole('heading', { name: 'Back squat, barbell' })).toBeVisible()
  await expect(page.getByText(/× 4 · RPE 9/)).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Zercher hold, / })).toBeVisible()
  expect(errors).toEqual([])
})

test('a signed-in set reaches the server: a fresh browser with the same sign-in shows it', async ({
  page,
  browser,
}) => {
  await signInAs(page.request, uniqueEmail(), 'Lifter')
  await page.goto('/#/lift')
  await appSettled(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lifting')
  await page.getByRole('button', { name: 'Log a set' }).click()
  await chooseLift(page, 'deadlift', 'Deadlift')
  await saveSet(page, '5', '315', '8')
  await expect(page.getByText(/× 5 · RPE 8/)).toBeVisible()
  // Kept only once the server has it.
  await expect(page.getByText('Not sent yet')).toHaveCount(0)

  // A new context has the cookie and none of this browser's stored sets, so the set can only come from the server.
  const fresh = await browser.newContext({ storageState: await page.context().storageState() })
  const other = await fresh.newPage()
  await other.goto('/#/lift')
  await appSettled(other)
  await expect(other.getByText(/× 5 · RPE 8/)).toBeVisible()
  await fresh.close()
})

test('Remove all in one tab empties the Lift page open in another', async ({ browser }) => {
  const context = await browser.newContext()
  const first = await context.newPage()
  const second = await context.newPage()
  await first.goto('/')
  await uploadFixtures(first, ['one-run.tcx'])
  await expect(first.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await goTo(first, 'Lift')
  await first.getByRole('button', { name: 'Log a set' }).click()
  await chooseLift(first, 'back squat', 'Back squat')
  await saveSet(first, '5', '225', '8')
  await first.getByRole('button', { name: 'Done' }).click()

  await second.goto('/#/lift')
  await appSettled(second)
  await expect(second.getByText(/× 5 · RPE 8/)).toBeVisible()

  await goTo(first, 'Profile')
  await first.getByRole('button', { name: 'Remove all my activities' }).click()
  await first
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove all', exact: true })
    .click()
  await expect(first.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()

  await expect(second.getByText('No sets')).toBeVisible({ timeout: 15_000 })
  await expect(second.getByText(/× 5 · RPE 8/)).toHaveCount(0)
  await context.close()
})
