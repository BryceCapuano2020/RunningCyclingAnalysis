import { expect, test } from '@playwright/test'
import { SETUP_DIALOG_NAME, activitiesRows, fixturePath, goTo, uploadFixtures } from './helpers.js'

// The questions asked before a first analysis: asked once, answered or skipped, and what each leaves behind.

test('the first upload asks for the athlete once, and a later upload after a reload does not', async ({
  page,
}) => {
  await page.goto('/')
  const setup = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('one-run.fit'))
  await expect(setup).toBeVisible()
  await setup.getByRole('button', { name: 'Analyse my files' }).click()
  await expect(setup).toBeHidden()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Add a ride to see your balance' }),
  ).toBeVisible()

  // The kept summaries bring the result back on reload, and the next file joins it without a dialog.
  await page.reload()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Add a ride to see your balance' }),
  ).toBeVisible()
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('one-ride.gpx'))
  await expect(await activitiesRows(page)).toHaveCount(2)
  await expect(setup).toHaveCount(0)
})

test('the weight entered in the setup dialog is the one the results use', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000)
  // The same export, answered with a different weight in another context, is the baseline.
  const baseline = await browser.newContext({ baseURL: testInfo.project.use.baseURL })
  const defaults = await baseline.newPage()
  await defaults.goto('/')
  await uploadFixtures(defaults, ['sample-export.zip'], '165')
  await expect(defaults.getByRole('heading', { level: 1 })).toHaveText(/leans toward running/, {
    timeout: 30_000,
  })
  const defaultRide = await defaults.getByRole('article', { name: 'Ride threshold' }).innerText()
  await baseline.close()

  await page.goto('/')
  const setup = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('sample-export.zip'))
  await expect(setup).toBeVisible()
  // The units are imperial by default, so this is 185 lb, about 83.9 kg.
  await setup.getByLabel('Body weight').fill('185')
  await setup.getByRole('button', { name: 'Analyse my files' }).click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/leans toward running/, {
    timeout: 30_000,
  })
  const ride = page.getByRole('article', { name: 'Ride threshold' })
  await expect(ride).toContainText('W/kg')
  await expect.poll(() => ride.innerText()).not.toBe(defaultRide)
  await goTo(page, 'Profile')
  await expect(page.getByLabel('Body weight')).toHaveValue(/^185(\.0)?$/)
})

test('skipping the weight holds the balance until one is entered, and asks for it', async ({
  page,
}) => {
  await page.goto('/')
  const setup = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('sample-export.zip'))
  await expect(setup).toBeVisible()
  await setup.getByRole('button', { name: 'Skip for now' }).click()

  // Both sports are on file, so the balance waits for the ride's weight; the run still shows.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Your balance waits for your weight',
    { timeout: 30_000 },
  )
  await expect(
    page.locator('p.lede', {
      hasText: 'Add your weight on Profile to grade your rides and compare them with your runs.',
    }),
  ).toBeVisible()
  await expect(page.getByRole('article', { name: 'Run threshold' })).toBeVisible()
})

test('skipping the setup dialog keeps a weight typed before it, as a valid answer', async ({
  page,
}) => {
  await page.goto('/')
  const setup = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('one-run.fit'))
  await expect(setup).toBeVisible()
  // Imperial by default, so this is 185 lb, about 83.9 kg: inside the typical range, so it is kept.
  await setup.getByLabel('Body weight').fill('185')
  await setup.getByRole('button', { name: 'Skip for now' }).click()

  await expect(setup).toBeHidden()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Add a ride to see your balance' }),
  ).toBeVisible()
  await goTo(page, 'Profile')
  await expect(page.getByLabel('Body weight')).toHaveValue(/^185(\.0)?$/)
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rca.preferences.v1') ?? 'null'),
  )
  expect(stored?.setupDone).toBe(true)
  expect(stored?.settings?.massKg).toBeCloseTo(185 * 0.45359237, 3)
})

test('skipping the setup dialog with nothing typed leaves the weight unset', async ({ page }) => {
  await page.goto('/')
  const setup = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('one-run.fit'))
  await expect(setup).toBeVisible()
  await setup.getByRole('button', { name: 'Skip for now' }).click()

  await expect(setup).toBeHidden()
  await goTo(page, 'Profile')
  // Nothing was typed, so the field is empty and says what a weight is for.
  await expect(page.getByLabel('Body weight')).toHaveValue('')
  await expect(
    page.getByText(
      'Not entered. Add your weight to grade your rides and compare them with your runs.',
    ),
  ).toBeVisible()
  // The skip is recorded as answered, with no weight saved.
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('rca.preferences.v1') ?? 'null'),
  )
  expect(stored?.setupDone).toBe(true)
  expect(stored?.settings?.massKg ?? null).toBeNull()
})
