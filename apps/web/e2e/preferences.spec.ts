import { expect, test } from '@playwright/test'
import { goTo, openSample } from './helpers.js'

test('switching to metric changes pace to per kilometre and the choice survives a reload', async ({
  page,
}) => {
  await openSample(page)
  await expect(page.getByText(/\d+:\d{2} \/mi/).first()).toBeVisible()

  await goTo(page, 'Profile')
  // The radio is visually hidden behind its label, so click the visible text.
  await page.getByText('Metric', { exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Metric' })).toBeChecked()

  await goTo(page, 'Balance')
  await expect(page.getByText(/\d+:\d{2} \/km/).first()).toBeVisible()
  await expect(page.getByRole('main').getByText(/\/mi\b/)).toHaveCount(0)

  await goTo(page, 'Profile')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Metric' })).toBeChecked()
  await openSample(page)
  await expect(page.getByText(/\d+:\d{2} \/km/).first()).toBeVisible()
})

test('changing body weight changes the cycling W/kg figures on the Balance page', async ({
  page,
}) => {
  await openSample(page)
  const ride = page.getByRole('region', { name: 'Ride', exact: true })
  await expect(ride).toContainText('W/kg')
  const before = await ride.innerText()

  await goTo(page, 'Profile')
  const body = page.getByLabel('Body weight')
  await body.fill('185')
  await body.blur()

  // Whole numbers are shown without a decimal place, so accept either form.
  await expect(body).toHaveValue(/^185(\.0)?$/)
  await goTo(page, 'Balance')
  await expect.poll(() => ride.innerText()).not.toBe(before)
  await expect(ride).toContainText('W/kg')
})
