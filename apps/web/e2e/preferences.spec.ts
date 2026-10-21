import { expect, test } from '@playwright/test'
import { LANDING_TITLE, openSample } from './helpers.js'

test('switching to metric changes pace to per kilometre and the choice survives a reload', async ({
  page,
}) => {
  await openSample(page)
  await expect(page.getByText(/\d+:\d{2} \/mi/).first()).toBeVisible()

  // The radio is visually hidden behind its label, so click the visible text.
  await page.getByText('Metric', { exact: true }).click()
  await expect(page.getByText(/\d+:\d{2} \/km/).first()).toBeVisible()
  await expect(page.getByText(/\/mi\b/)).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Metric' })).toBeChecked()
  await openSample(page)
  await expect(page.getByText(/\d+:\d{2} \/km/).first()).toBeVisible()
})

test('changing body weight changes the cycling W/kg figures', async ({ page }) => {
  await openSample(page)
  const cycling = page.getByRole('listitem').filter({ hasText: 'Cycling threshold' })
  await expect(cycling).toContainText('W/kg')
  const before = await cycling.innerText()

  const body = page.getByLabel('Body weight')
  await body.fill('185')
  await body.blur()

  // Whole numbers are shown without a decimal place, so accept either form.
  await expect(body).toHaveValue(/^185(\.0)?$/)
  await expect.poll(() => cycling.innerText()).not.toBe(before)
  await expect(cycling).toContainText('W/kg')
})
