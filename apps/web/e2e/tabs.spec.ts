import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Me } from '@rca/contract'
import {
  BALANCE_TITLE,
  LANDING_TITLE,
  goTo,
  signInAs,
  uniqueEmail,
  uploadFixtures,
} from './helpers.js'

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

test('a second tab shows what the first imported, and what it removed, without a reload', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const first = await context.newPage()
  const second = await context.newPage()
  await first.goto('/')
  await second.goto('/')
  await expect(second.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()

  await uploadFixtures(first, ['one-ride.gpx', 'one-run.tcx'])
  await expect(first.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  // The second tab was open on the landing page, and now has the results.
  await expect(second.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE, {
    timeout: 15_000,
  })

  // Removing everything in the second tab empties the first.
  await goTo(second, 'Profile')
  await second.getByRole('button', { name: 'Remove all my activities' }).click()
  await second
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove all', exact: true })
    .click()
  await expect(second.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  await expect(first.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible({
    timeout: 15_000,
  })
  await context.close()
})

test('a tab that missed Remove all cannot bring back an import’s summaries or recordings', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const first = await context.newPage()
  // The second tab never hears the first: it is the tab that was out of date when the clear came.
  const second = await context.newPage()
  await second.addInitScript(() => {
    Object.defineProperty(window, 'BroadcastChannel', { value: undefined })
  })
  await first.goto('/')
  await uploadFixtures(first, ['one-ride.gpx', 'one-run.tcx'])
  await expect(first.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await second.goto('/')
  await expect(second.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)

  // The first tab removes everything while the second still shows it.
  await goTo(first, 'Profile')
  await first.getByRole('button', { name: 'Remove all my activities' }).click()
  await first
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Remove all', exact: true })
    .click()
  await expect(first.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()

  // The second tab, out of date, imports a file.
  await uploadFixtures(second, ['one-run.fit'])
  await expect(second.getByText('Import stopped', { exact: true })).toBeVisible({ timeout: 20_000 })

  // Nothing of that import is in the browser: not its summary, not its recording.
  await second.reload()
  await expect(second.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  const kept = await second.evaluate(async () => {
    const open = (name: string) =>
      new Promise<IDBDatabase | null>((resolve) => {
        const request = indexedDB.open(name)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(null)
      })
    const count = async (name: string, store: string) => {
      const db = await open(name)
      if (db === null || !db.objectStoreNames.contains(store)) return 0
      return new Promise<number>((resolve) => {
        const request = db.transaction(store, 'readonly').objectStore(store).count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => resolve(-1)
      })
    }
    return {
      // The epoch row is the one thing the library keeps when it is empty.
      summaries: (await count('rca-device-library', 'digests')) - 1,
      recordings: await count('rca-workbench-evidence', 'entries'),
    }
  })
  expect(kept.recordings).toBe(0)
  expect(kept.summaries).toBe(0)
  await context.close()
})
