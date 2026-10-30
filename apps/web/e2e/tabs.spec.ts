import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

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
