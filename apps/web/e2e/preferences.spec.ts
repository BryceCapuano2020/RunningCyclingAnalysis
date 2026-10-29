import { expect, test } from '@playwright/test'
import { goTo, openSample, uploadFixtures } from './helpers.js'

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

test('a visitor’s own ride W/kg follows the body weight they enter on Profile', async ({
  page,
}) => {
  test.setTimeout(90_000)
  // The units are imperial by default, so the setup dialog's weight is 165 lb, about 74.8 kg.
  await page.goto('/')
  await uploadFixtures(page, ['sample-export.zip'], '165')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/leans toward running/, {
    timeout: 30_000,
  })
  const ride = page.getByRole('article', { name: 'Ride threshold' })
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

test('the sample keeps its own 75 kg whatever weight the visitor enters, and the weight is kept for later', async ({
  page,
}) => {
  await openSample(page)
  const ride = page.getByRole('article', { name: 'Ride threshold' })
  await expect(ride).toContainText('W/kg')
  const before = await ride.innerText()

  await goTo(page, 'Profile')
  const body = page.getByLabel('Body weight')
  await body.fill('185')
  await body.blur()
  await expect(body).toHaveValue(/^185(\.0)?$/)

  // The sample is analysed with its own mass, so the Ride figures do not move.
  await goTo(page, 'Balance')
  await expect(ride).toContainText('W/kg')
  expect(await ride.innerText()).toBe(before)

  // The visitor's own weight is still on Profile for when they add files of their own.
  await goTo(page, 'Profile')
  await expect(page.getByLabel('Body weight')).toHaveValue(/^185(\.0)?$/)
})
