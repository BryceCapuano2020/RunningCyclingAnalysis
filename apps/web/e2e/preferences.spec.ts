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

test('the sample keeps its own 75 kg whatever weight the visitor has entered, and that weight is kept for later', async ({
  page,
}) => {
  await openSample(page)
  const ride = page.getByRole('article', { name: 'Ride threshold' })
  await expect(ride).toContainText('W/kg')
  const before = await ride.innerText()

  // The visitor's own weight, entered before and kept in this browser.
  await page.evaluate(() => {
    localStorage.setItem(
      'rca.preferences.v1',
      JSON.stringify({
        settings: { massKg: 83.9, bikeMassKg: 9 },
        units: 'imperial',
        birthYear: null,
        sex: null,
        setupDone: true,
      }),
    )
  })
  await page.reload()
  await openSample(page)
  await expect(ride).toContainText('W/kg')
  // The sample is analysed with its own mass, so the Ride figures do not move.
  expect(await ride.innerText()).toBe(before)

  // Profile shows the sample's settings, read-only, and not the visitor's.
  await goTo(page, 'Profile')
  const settings = page.getByRole('region', { name: 'Sample athlete' })
  await expect(settings.getByText('165.3 lb')).toBeVisible()
  await expect(page.getByLabel('Body weight')).toHaveCount(0)
  // Looking at the sample leaves what the visitor entered as it was, for when they add files of their own.
  const kept = await page.evaluate(() => localStorage.getItem('rca.preferences.v1'))
  expect(JSON.parse(kept ?? '{}')).toMatchObject({ settings: { massKg: 83.9 } })
})
