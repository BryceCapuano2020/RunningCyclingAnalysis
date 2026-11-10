import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { appSettled, goTo, openSample, signInAs, trackErrors, uniqueEmail } from './helpers.js'

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

  await page.getByRole('button', { name: 'Edit set 2' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('button', { name: /^Edit set / })).toHaveCount(1)
  await expect(page.getByText(/× 4 · RPE 9/)).toHaveCount(0)

  await page.getByRole('button', { name: 'Log a set' }).click()
  await chooseLift(page, 'zercher hold', 'Add ‘Zercher hold’')
  await saveSet(page, '8', '40')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: /^Zercher hold, / })).toBeVisible()

  await page.reload()
  await appSettled(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lifting')
  await expect(page.getByRole('heading', { name: 'Back squat, barbell' })).toBeVisible()
  await expect(page.getByText(/× 5 · RPE 8/)).toBeVisible()
  await expect(page.getByRole('heading', { name: /^Zercher hold, / })).toBeVisible()
  expect(errors).toEqual([])
})

test('a signed-in set is there after a reload', async ({ page }) => {
  await signInAs(page.request, uniqueEmail(), 'Lifter')
  await page.goto('/#/lift')
  await appSettled(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lifting')
  await page.getByRole('button', { name: 'Log a set' }).click()
  await chooseLift(page, 'deadlift', 'Deadlift')
  await saveSet(page, '5', '315', '8')
  await expect(page.getByText(/× 5 · RPE 8/)).toBeVisible()

  await page.reload()
  await appSettled(page)
  await expect(page.getByText(/× 5 · RPE 8/)).toBeVisible()
})
