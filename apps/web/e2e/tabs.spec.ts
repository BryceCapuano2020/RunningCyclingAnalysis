import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Me } from '@rca/contract'
import { signInAs, uniqueEmail } from './helpers.js'

/** The weight kept in this browser, in kilograms, as the preferences hold it. */
async function keptKg(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('rca.preferences.v1')
    return raw === null
      ? null
      : (JSON.parse(raw) as { settings: { massKg: number | null } }).settings.massKg
  })
}

test('a second tab follows the units chosen in the first, and an out-of-date tab cannot put back a weight', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const first = await context.newPage()
  const second = await context.newPage()
  await first.goto('/#/profile')
  await second.goto('/#/profile')
  await expect(first.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()
  await expect(second.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()

  // Choosing metric in one tab shows in the other with no reload.
  await first.getByText('Metric', { exact: true }).click()
  await expect(first.getByRole('radio', { name: 'Metric' })).toBeChecked()
  await expect(second.getByRole('radio', { name: 'Metric' })).toBeChecked()

  // The second tab enters a weight. The first tab hears of it, but even a tab that had not would
  // write only the field it changes.
  const body = second.getByLabel('Body weight')
  await body.fill('80')
  await body.blur()
  await expect.poll(() => keptKg(second)).toBe(80)

  await first.getByText('Imperial', { exact: true }).click()
  await expect(first.getByRole('radio', { name: 'Imperial' })).toBeChecked()
  await expect(second.getByRole('radio', { name: 'Imperial' })).toBeChecked()
  expect(await keptKg(first)).toBe(80)
  await context.close()
})

test('a signed-in second tab hears that the first signed out, and keeps the weight it is given off the account', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const email = uniqueEmail()
  await signInAs(context.request, email, 'Ada Lovelace')
  const first = await context.newPage()
  const second = await context.newPage()
  await first.goto('/#/profile')
  await second.goto('/#/profile')
  await expect(first.getByRole('button', { name: 'Ada', exact: true })).toBeVisible()
  await expect(second.getByRole('button', { name: 'Ada', exact: true })).toBeVisible()

  await first.getByRole('button', { name: 'Ada', exact: true }).click()
  await first.getByRole('button', { name: 'Sign out' }).click()
  await expect(first.getByRole('button', { name: 'Sign in with Google' }).first()).toBeVisible()

  // The second tab is told, with no click or reload of its own.
  await expect(second.getByText(/You signed out in another tab/)).toBeVisible()

  // A weight typed there stays on this device: nothing reaches the account.
  const body = second.getByLabel('Body weight')
  await body.fill('91')
  await body.blur()
  await signInAs(context.request, email, 'Ada Lovelace')
  const { profile } = (await (await context.request.get('/api/me')).json()) as Me
  expect(profile.massKg).toBeNull()
  await context.close()
})
