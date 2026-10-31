import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import {
  activitiesRows,
  apiActivities,
  completeSetup,
  fixturePath,
  signInAs,
  uniqueEmail,
  uploadFixtures,
} from './helpers.js'

// These tests add files on purpose before the app has settled, which uploadFixtures would wait out.

const NAME = 'Ada Lovelace'
const IMPORT = { timeout: 30_000 }

function restoring(page: Page) {
  return page.getByRole('heading', { name: 'Restoring your results' })
}

/** Holds the signed-in library's first read until released, so the restoring page stays up. */
async function holdLibrary(page: Page): Promise<() => void> {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/api\/activities\?/, async (route) => {
    await gate
    await route.continue()
  })
  return release
}

async function openRestoring(page: Page): Promise<() => void> {
  await signInAs(page.request, uniqueEmail(), NAME)
  const release = await holdLibrary(page)
  await page.goto('/')
  await expect(restoring(page)).toBeVisible()
  return release
}

async function expectOneImported(page: Page) {
  await completeSetup(page, IMPORT.timeout)
  await expect.poll(async () => (await apiActivities(page.request)).length, IMPORT).toBe(1)
  await expect(await activitiesRows(page)).toHaveCount(1, IMPORT)
}

test('a file chosen while the library restores is imported once it has loaded', async ({
  page,
}) => {
  const release = await openRestoring(page)
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath('one-run.fit'))
  release()
  await expectOneImported(page)
})

test('a file chosen on the restoring page after it has been replaced is not lost', async ({
  page,
}) => {
  const release = await openRestoring(page)
  const input = await page.locator('input[type="file"]').first().elementHandle()
  if (input === null) throw new Error('the restoring page has no file input')
  release()
  await expect(restoring(page)).toBeHidden()
  // The chooser was open while the page changed: its choice lands on an input that has left the page.
  const bytes = (await readFile(fixturePath('one-run.fit'))).toString('base64')
  await input.evaluate((element, data) => {
    const field = element as HTMLInputElement
    const transfer = new DataTransfer()
    transfer.items.add(
      new File([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], 'one-run.fit'),
    )
    field.files = transfer.files
    field.dispatchEvent(new Event('change', { bubbles: true }))
  }, bytes)
  await expectOneImported(page)
})

test('a duplicate chosen while sign-in is checked restores its detail once the lookup answers', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-run.tcx'])
  await page.goto('/privacy')
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('rca-workbench-evidence')
        request.onsuccess = () => resolve()
        request.onerror = () => reject(request.error)
        request.onblocked = () => reject(new Error('recording cache is still open'))
      }),
  )
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/me', async (route) => {
    await gate
    await route.continue()
  })
  await page.goto('/')
  await expect(page.getByText('Checking sign-in…')).toBeVisible()
  await uploadFixtures(page, ['one-run.tcx'], undefined, { settled: false })
  release()
  await expect(page.getByText('Checking sign-in…')).toBeHidden()
  await expect(page.locator('.import-notice')).toBeVisible()
  await (await activitiesRows(page)).first().getByRole('link').click()
  const workbench = page.getByRole('region', { name: 'In detail', exact: true })
  await expect(workbench.getByRole('slider', { name: 'Selection start' })).toBeVisible(IMPORT)
  await expect(workbench.getByText(/Add this activity's file again/)).toHaveCount(0)
})
