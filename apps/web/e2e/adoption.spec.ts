import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  BALANCE_TITLE,
  activitiesRows,
  apiActivities,
  signInAs,
  uniqueEmail,
  uploadFixtures,
} from './helpers.js'

const NAME = 'Ada Lovelace'
const KEPT = 'Activities kept in this browser'

/** How many workouts this browser keeps for a signed-out visitor, read from its own storage. */
function keptRows(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const opening = indexedDB.open('rca-device-library')
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const db = opening.result
          if (!db.objectStoreNames.contains('digests')) {
            db.close()
            resolve(0)
            return
          }
          // The library also keeps its epoch in a reserved row, which is not a workout.
          const keys = db.transaction('digests').objectStore('digests').getAllKeys()
          keys.onsuccess = () => {
            db.close()
            resolve(keys.result.filter((key) => !String(key).startsWith('__')).length)
          }
        }
      }),
  )
}

/** Imports a file signed out, so this browser keeps it, then signs in as a new account on the same browser. */
async function keepOneThenSignIn(page: Page, email: string): Promise<void> {
  await page.goto('/')
  await uploadFixtures(page, ['one-run.fit'])
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect.poll(() => keptRows(page)).toBe(1)
  await signInAs(page.request, email, NAME)
  await page.goto('/')
}

test('offers what this browser kept to the account that signs in, and moves it there on Add', async ({
  page,
}) => {
  const email = uniqueEmail()
  await keepOneThenSignIn(page, email)

  const offer = page.getByRole('region', { name: KEPT })
  await expect(offer).toBeVisible()
  await expect(offer).toContainText(`Add it to ${email}?`)

  await offer.getByRole('button', { name: 'Add to my account' }).click()

  await expect(page.getByText('Added 1 activity to your account.').first()).toBeVisible()
  await expect(offer).toHaveCount(0)
  expect(await apiActivities(page.request)).toHaveLength(1)
  await expect(await activitiesRows(page)).toHaveCount(1)
  // The kept copy leaves this browser once the account has it, so signing out does not show it twice.
  await expect.poll(() => keptRows(page)).toBe(0)
})

test('removes what this browser kept on request, and leaves the account as it is', async ({
  page,
}) => {
  await keepOneThenSignIn(page, uniqueEmail())
  const offer = page.getByRole('region', { name: KEPT })
  await offer.getByRole('button', { name: 'Remove from this browser' }).click()

  const dialog = page.getByRole('alertdialog', { name: 'Remove these from this browser?' })
  await expect(dialog).toContainText('1 activity kept here')
  await dialog.getByRole('button', { name: 'Remove' }).click()

  await expect(offer).toHaveCount(0)
  await expect.poll(() => keptRows(page)).toBe(0)
  expect(await apiActivities(page.request)).toHaveLength(0)
})

test('does not ask again after Not now', async ({ page }) => {
  await keepOneThenSignIn(page, uniqueEmail())
  const offer = page.getByRole('region', { name: KEPT })
  await offer.getByRole('button', { name: 'Not now' }).click()
  await expect(offer).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole('button', { name: 'Ada', exact: true })).toBeVisible()
  await expect(offer).toHaveCount(0)
  await expect.poll(() => keptRows(page)).toBe(1)
})
