import { expect, test } from '@playwright/test'
import { BALANCE_TITLE, LANDING_TITLE, activitiesRows, goTo, openSample } from './helpers.js'

test('choosing 6 weeks narrows the activities and All time restores them all', async ({ page }) => {
  await openSample(page)
  const period = page.getByRole('group', { name: 'Period' })
  await expect(page.getByText(/of 14 activities/)).toHaveCount(0)

  await period.getByText('6 weeks', { exact: true }).click()
  await expect(page.getByText(/^\d+ of 14 activities$/)).toBeVisible()
  const shown = await (await activitiesRows(page)).count()
  expect(shown).toBeGreaterThan(0)
  expect(shown).toBeLessThan(14)

  await goTo(page, 'Balance')
  await period.getByText('All time', { exact: true }).click()
  await expect(page.getByText(/of 14 activities/)).toHaveCount(0)
  await expect(await activitiesRows(page)).toHaveCount(14)
})

test('the period picker is also on the Run and Ride pages', async ({ page }) => {
  await openSample(page)
  for (const sport of ['Run', 'Ride'] as const) {
    await goTo(page, sport)
    await expect(page.getByRole('group', { name: 'Period' })).toBeVisible()
  }
})

test('a six-week period compares the best efforts with the six weeks before it', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Run')
  await expect(page.getByRole('list', { name: 'Legend' })).toHaveCount(0)

  await page.getByRole('group', { name: 'Period' }).getByText('6 weeks', { exact: true }).click()
  await expect(
    page.getByRole('list', { name: 'Legend' }).getByText('Previous 6 weeks'),
  ).toBeVisible()
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
    card.getByRole('img', {
      name: /^Running grade-adjusted pace per (kilometre|mile), best 20 minutes by week\. /,
    }),
  ).toBeAttached()

  // Each chart has its own table view; the running one is checked here.
  const details = card.locator('details').first()
  await expect(details).not.toHaveAttribute('open')
  await details.locator('summary').click()
  await expect(details).toHaveAttribute('open')
  await expect(details.getByRole('columnheader', { name: 'Week ending' })).toBeVisible()
  await expect(details.getByRole('rowheader').first()).toHaveText(
    /^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}( \d{4})?$/,
  )

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
  await expect(await activitiesRows(page)).toHaveCount(14)
})

test('How sure is this? keeps the disclaimer that hard best efforts do not prove all-out effort', async ({
  page,
}) => {
  await openSample(page)
  // The sample's best 20 minute efforts both reach 90% of their heart-rate reference, so the
  // Evidence card reports real efforts and the method page says what that does not prove.
  await expect(page.getByRole('heading', { level: 2, name: 'Built on real efforts' })).toBeVisible()

  await page.getByRole('link', { name: 'How sure is this?' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'How sure is this?' })).toBeVisible()
  await expect(
    page.getByText('That makes them hard, but does not prove either was all-out.'),
  ).toBeVisible()
})

test('focus moves to the Balance heading after sample data, and to the landing heading after start over', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'See a sample athlete' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()

  await goTo(page, 'Profile')
  await page.getByRole('button', { name: 'Start over' }).click()
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeFocused()
})
