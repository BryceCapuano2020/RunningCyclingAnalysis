import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  activitiesRows,
  apiActivities,
  importSummaryShown,
  signInAs,
  trackErrors,
  uniqueEmail,
  uploadFixtures,
} from './helpers.js'

const NEW_NAME = 'Hill repeats with the club'

/** Opens the first activity in the list and returns the name its row showed. */
async function openFirst(page: Page): Promise<string> {
  const rows = await activitiesRows(page)
  const link = rows.first().getByRole('link').first()
  const name = ((await link.textContent()) ?? '').trim()
  await link.click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
  return name
}

test('renaming a kept activity shows on its page and in the list, and survives a reload', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await uploadFixtures(page, ['one-ride.gpx'])
  const was = await openFirst(page)

  await page.getByRole('button', { name: 'Edit name' }).click()
  const field = page.getByRole('textbox', { name: 'Activity name' })
  await expect(field).toHaveValue(was)
  await field.fill(`  ${NEW_NAME}  `)
  await field.press('Enter')
  await expect(page.getByRole('heading', { level: 1, name: NEW_NAME })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Activity name' })).toHaveCount(0)
  await expect(page).toHaveTitle(new RegExp(NEW_NAME))

  const rows = await activitiesRows(page)
  await expect(rows.first().getByRole('link', { name: NEW_NAME, exact: true })).toBeVisible()

  await page.reload()
  await expect(await activitiesRows(page)).toHaveCount(1)
  await expect(page.getByRole('link', { name: NEW_NAME, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: was, exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('Escape and Cancel leave the name as it was', async ({ page }) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-ride.gpx'])
  const was = await openFirst(page)

  await page.getByRole('button', { name: 'Edit name' }).click()
  await page.getByRole('textbox', { name: 'Activity name' }).fill('Not saved')
  await page.getByRole('textbox', { name: 'Activity name' }).press('Escape')
  await expect(page.getByRole('heading', { level: 1, name: was })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit name' })).toBeFocused()

  await page.getByRole('button', { name: 'Edit name' }).click()
  await page.getByRole('textbox', { name: 'Activity name' }).fill('Not saved')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { level: 1, name: was })).toBeVisible()
})

test('a signed-in rename is kept by the server and survives a reload', async ({ page }) => {
  const errors = trackErrors(page)
  await signInAs(page.request, uniqueEmail(), 'Test Athlete')
  await page.goto('/')
  await uploadFixtures(page, ['one-run.tcx'])
  await importSummaryShown(page, 'Added', /^1 run$/)
  const was = await openFirst(page)

  await page.getByRole('button', { name: 'Edit name' }).click()
  await page.getByRole('textbox', { name: 'Activity name' }).fill(NEW_NAME)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('heading', { level: 1, name: NEW_NAME })).toBeVisible()

  const [record] = await apiActivities(page.request)
  expect(record?.digest.name).toBe(NEW_NAME)
  expect(record?.digest.name).not.toBe(was)

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: NEW_NAME })).toBeVisible()
  expect(errors).toEqual([])
})
