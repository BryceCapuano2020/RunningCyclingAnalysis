import { expect, test } from '@playwright/test'
import {
  SETUP_DIALOG_NAME,
  apiActivities,
  appSettled,
  fixturePath,
  signInAs,
  uniqueEmail,
} from './helpers.js'

/**
 * Signed in, the answers go to the account. Pressed offline, Analyse my files says the connection dropped and keeps the
 * press: it runs by itself when the connection returns, with no second press.
 */
test('Analyse my files pressed offline says so, and runs when the connection returns', async ({
  page,
  context,
}) => {
  test.setTimeout(90_000)
  await signInAs(page.request, uniqueEmail(), 'Ada Lovelace')
  await page.goto('/')
  await appSettled(page)
  const setup = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('one-run.fit'))
  await expect(setup).toBeVisible()
  await setup.getByLabel('Body weight').fill('70')

  await context.setOffline(true)
  await setup.getByRole('button', { name: 'Analyse my files' }).click()
  await expect(setup.getByRole('alert')).toContainText('Your connection dropped')
  await expect(setup).toBeVisible()

  await context.setOffline(false)
  await expect(setup).toBeHidden({ timeout: 30_000 })
  // The files were analysed and saved to the account with no second press.
  await expect.poll(async () => (await apiActivities(page.request)).length).toBe(1)
})
