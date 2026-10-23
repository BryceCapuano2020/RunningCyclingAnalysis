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

test('the fitness over time card shows for sample data, and its table toggles', async ({
  page,
}) => {
  await openSample(page)
  const card = page.locator('section').filter({
    has: page.getByRole('heading', { level: 2, name: 'Fitness over time', exact: true }),
  })
  await expect(card).toBeVisible()
  await expect(
    card.getByText(
      'Your best estimated energy rate over 20 min in the previous 6 weeks, each week.',
    ),
  ).toBeVisible()
  await expect(
    card.getByRole('img', { name: /^Fitness over time\. Best estimated energy rate/ }),
  ).toBeAttached()

  const details = card.locator('details')
  await expect(details).not.toHaveAttribute('open')
  await details.locator('summary').click()
  await expect(details).toHaveAttribute('open')
  await expect(details.getByRole('columnheader', { name: 'Week ending' })).toBeVisible()
  await expect(details.getByRole('cell').first()).toHaveText(/^[A-Z][a-z]{2} \d{1,2}, \d{4}$/)

  await details.locator('summary').click()
  await expect(details).not.toHaveAttribute('open')
})

test('period labels remain clickable at a narrow viewport with enlarged text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await openSample(page)
  await page.addStyleTag({ content: ':root { font-size: 20px; }' })
  const period = page.getByRole('group', { name: 'Period' })
  await period.getByText('6 weeks', { exact: true }).click()
  await expect(page.getByText(/^\d+ of 14 activities$/)).toBeVisible()
  await period.getByText('All time', { exact: true }).click()
  await expect(activitiesRows(page)).toHaveCount(14)
})

test('the headline shows the disclaimer that a heart-rate check does not establish all-out effort', async ({
  page,
}) => {
  await openSample(page)
  await expect(page.getByText(/This does not establish that either was all-out/)).toBeVisible()
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
