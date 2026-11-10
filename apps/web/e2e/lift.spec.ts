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

/** A lift's heading in the day view: the lead and the lifts list name the same lift above it. */
function dayLift(page: Page, name: string | RegExp) {
  return page.locator('.lift__lift').getByRole('heading', { name })
}

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

  await expect(dayLift(page, 'Back squat, barbell')).toBeVisible()
  await expect(page.getByText(/×\s5\s·\sRPE\s8/)).toBeVisible()
  await expect(page.getByText(/×\s3\s·\sRPE\s9/)).toBeVisible()
  await expect(page.getByRole('button', { name: /^Edit set / })).toHaveCount(2)

  await page.getByRole('button', { name: 'Edit set 2' }).click()
  await page.getByLabel('Reps').fill('4')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(/×\s4\s·\sRPE\s9/)).toBeVisible()
  await expect(page.getByText(/×\s3\s·\sRPE\s9/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit set 2' })).toBeFocused()

  // Done on an edit puts focus back on that row's button.
  await page.getByRole('button', { name: 'Edit set 2' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: 'Edit set 2' })).toBeFocused()

  // A delete moves focus to the next row: the set that was second is first now.
  await page.getByRole('button', { name: 'Edit set 1' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('button', { name: /^Edit set / })).toHaveCount(1)
  await expect(page.getByText(/×\s5\s·\sRPE\s8/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Edit set 1' })).toBeFocused()

  // Deleting the last row of a lift with more sets moves focus to the lift's heading.
  await page.getByRole('button', { name: 'Log a set' }).click()
  await chooseLift(page, 'back squat', 'Back squat')
  await saveSet(page, '6', '225', '7')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('button', { name: 'Edit set 2' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(page.getByRole('button', { name: /^Edit set / })).toHaveCount(1)
  await expect(dayLift(page, 'Back squat, barbell')).toBeFocused()

  await page.getByRole('button', { name: 'Log a set' }).click()
  await chooseLift(page, 'zercher hold', 'Add ‘Zercher hold’')
  await saveSet(page, '8', '40')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(dayLift(page, /^Zercher hold, /)).toBeVisible()

  await page.reload()
  await appSettled(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lifting')
  await expect(dayLift(page, 'Back squat, barbell')).toBeVisible()
  await expect(page.getByText(/×\s4\s·\sRPE\s9/)).toBeVisible()
  await expect(dayLift(page, /^Zercher hold, /)).toBeVisible()
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
  await expect(page.getByText(/×\s5\s·\sRPE\s8/)).toBeVisible()
  // Kept only once the server has it.
  await expect(page.getByText('Not sent yet')).toHaveCount(0)

  // A new context has the cookie and none of this browser's stored sets, so the set can only come from the server.
  const fresh = await browser.newContext({ storageState: await page.context().storageState() })
  const other = await fresh.newPage()
  await other.goto('/#/lift')
  await appSettled(other)
  await expect(other.getByText(/×\s5\s·\sRPE\s8/)).toBeVisible()
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
  await expect(second.getByText(/×\s5\s·\sRPE\s8/)).toBeVisible()

  await goTo(first, 'Profile')
  await first.getByRole('button', { name: 'Remove all my activities' }).click()
  await first
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove all', exact: true })
    .click()
  await expect(first.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()

  await expect(second.getByText('No sets')).toBeVisible({ timeout: 15_000 })
  await expect(second.getByText(/×\s5\s·\sRPE\s8/)).toHaveCount(0)
  await context.close()
})

test('imports a Hevy file signed out: previews it, then shows the sets on the day', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto('/#/lift')
  await appSettled(page)
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 07:30:00`
  const header =
    'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'
  const row = (lift: string, index: number, type: string, kg: string, reps: string, rpe = '') =>
    ['Test day', start, '', '', lift, '', '', index, type, kg, reps, '', '', rpe].join(',')
  const csv = [
    header,
    row('Squat (Barbell)', 0, 'warmup', '40', '8'),
    row('Squat (Barbell)', 1, 'normal', '100', '5', '8'),
    row('Squat (Barbell)', 2, 'failure', '100', '4'),
    row('Bench Press (Barbell)', 0, 'normal', 'abc', '5'),
  ].join('\n')

  await page.getByRole('button', { name: 'Import from Hevy' }).click()
  await expect(page.getByRole('button', { name: 'Log a set' })).toHaveCount(0)
  await page.getByLabel('Hevy workouts file').setInputFiles({
    name: 'workouts.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(csv),
  })
  await expect(page.getByText('3 sets on 1 day')).toBeVisible()
  await expect(page.getByText(/The weight is not a number\. Rows 5\./)).toBeVisible()
  // Nothing is written until it is confirmed.
  await expect(page.getByRole('button', { name: /^Edit set / })).toHaveCount(0)
  await page.getByRole('button', { name: 'Import sets' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Imported 3 sets' })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()

  await expect(dayLift(page, 'Back squat, barbell')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Edit set / })).toHaveCount(3)
  await expect(page.getByText(/×\s4\s·\sRPE\s10/)).toBeVisible()
  await page.reload()
  await appSettled(page)
  await expect(page.getByRole('button', { name: /^Edit set / })).toHaveCount(3)
  expect(errors).toEqual([])
})
