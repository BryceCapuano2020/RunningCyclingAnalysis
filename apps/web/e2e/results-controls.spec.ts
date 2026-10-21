import { expect, test } from '@playwright/test'
import { LANDING_TITLE, activitiesRows, openSample } from './helpers.js'

test('choosing 6 weeks narrows the activities and All time restores them all', async ({ page }) => {
  await openSample(page)
  const period = page.getByRole('group', { name: 'Period' })
  await expect(activitiesRows(page)).toHaveCount(14)
  await expect(page.getByText(/of 14 activities/)).toHaveCount(0)

  await period.getByText('6 weeks', { exact: true }).click()
  await expect(page.getByText(/^\d+ of 14 activities$/)).toBeVisible()
  const shown = await activitiesRows(page).count()
  expect(shown).toBeGreaterThan(0)
  expect(shown).toBeLessThan(14)

  await period.getByText('All time', { exact: true }).click()
  await expect(activitiesRows(page)).toHaveCount(14)
  await expect(page.getByText(/of 14 activities/)).toHaveCount(0)
})

test('the headline says both best efforts were close to all-out for the sample data', async ({
  page,
}) => {
  await openSample(page)
  await expect(
    page.getByText('Both best efforts were close to all-out by heart rate'),
  ).toBeVisible()
})

test('focus moves to the results heading after sample data and back to the landing heading after start over', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try sample data' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/running|cycling/i)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()

  await page.getByRole('button', { name: 'Start over' }).click()
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeFocused()
})
