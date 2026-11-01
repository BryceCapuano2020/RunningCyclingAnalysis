import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { SETUP_DIALOG_NAME, fixturePath, goTo } from './helpers.js'

/**
 * Skip is always allowed: the dialog says everything in it is optional. Text that is not a weight or a year does not
 * hold the visitor in the dialog, and is not kept: Skip drops it with the error it raised. Run at the project's own
 * window and at 320 px, where the error lines wrap and move the buttons most.
 */
const WINDOWS = [
  { name: 'the project window' },
  { name: '320 px', width: 320, height: 640 },
] as const

async function openSetup(page: Page) {
  await page.goto('/')
  const setup = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('one-run.fit'))
  await expect(setup).toBeVisible()
  return setup
}

for (const size of WINDOWS) {
  test.describe(`Skip for now at ${size.name}`, () => {
    test.beforeEach(async ({ page }) => {
      if ('width' in size) await page.setViewportSize({ width: size.width, height: size.height })
    })

    test('leaves the dialog with unreadable weight and year typed, and keeps neither', async ({
      page,
    }) => {
      const setup = await openSetup(page)
      await setup.getByLabel('Body weight').fill('heavy')
      // The year is typed last, so a press on Skip takes focus off it, which is when it judges its text.
      await setup.getByLabel('Year of birth').fill('19x6')
      await setup.getByRole('button', { name: 'Skip for now' }).click()

      await expect(setup).toBeHidden()
      await goTo(page, 'Profile')
      await expect(page.getByLabel('Body weight')).toHaveValue('')
      await expect(page.getByLabel('Year of birth')).toHaveValue('')
      const stored = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('rca.preferences.v1') ?? 'null'),
      )
      expect(stored?.setupDone).toBe(true)
      expect(stored?.birthYear ?? null).toBeNull()
      expect(stored?.settings?.massKg ?? null).toBeNull()
    })

    test('keeps a valid year when pressed straight from an unreadable weight', async ({ page }) => {
      const setup = await openSetup(page)
      await setup.getByLabel('Year of birth').fill('1990')
      // Focus is left in the weight field. Its error opens under it on the press, and moved the button away.
      await setup.getByLabel('Body weight').fill('heavy')
      await setup.getByRole('button', { name: 'Skip for now' }).click()

      await expect(setup).toBeHidden()
      await goTo(page, 'Profile')
      await expect(page.getByLabel('Year of birth')).toHaveValue('1990')
      await expect(page.getByLabel('Body weight')).toHaveValue('')
    })
  })
}
