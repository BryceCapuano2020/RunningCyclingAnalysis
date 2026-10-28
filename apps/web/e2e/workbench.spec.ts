import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import {
  activitiesRows,
  apiActivities,
  CLIENT_HEADERS,
  enableFileRetention,
  fixturePath,
  goTo,
  openSample,
  signInAs,
  trackErrors,
  uniqueEmail,
  uploadFixtures,
} from './helpers.js'

async function openFirstActivity(page: Page) {
  const rows = await activitiesRows(page)
  await rows.first().getByRole('link').click()
  return page.getByRole('region', { name: 'In detail', exact: true })
}

async function removeRecordingCache(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('rca-workbench-evidence')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => reject(new Error('recording cache is still open'))
    })
  })
}

test('an imported activity supports keyboard selection and restores its details after reload', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.goto('/')
  await uploadFixtures(page, ['one-run.tcx'])
  const workbench = await openFirstActivity(page)
  const start = workbench.getByRole('textbox', { name: 'Start time', exact: true })
  const end = workbench.getByRole('textbox', { name: 'End time', exact: true })
  await expect(start).toBeVisible()
  await end.fill('0:30')
  await end.press('Enter')
  await start.fill('0:10')
  await start.press('Enter')
  await expect(workbench.getByText('Elapsed time').locator('..')).toContainText('20 s')
  await workbench.getByRole('slider', { name: 'Start time slider' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(start).toHaveValue('0:11')
  await expect(
    workbench.getByRole('table', { name: /while moving in the selected interval/i }),
  ).toBeVisible()
  await expect(workbench.locator('svg').first()).toBeVisible()

  await page.reload()
  await expect(start).toHaveValue('0:00')
  await expect(workbench.locator('svg').first()).toBeVisible()
  expect(errors).toEqual([])
})

test('a legacy summary without detail evidence requests reimport and a duplicate import restores it', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-run.tcx'])
  await openFirstActivity(page)
  // A new document destroys the worker and closes its cache connection before removing evidence.
  await page.goto('/privacy')
  await removeRecordingCache(page)
  await page.goto('/')
  const workbench = await openFirstActivity(page)
  await expect(workbench.getByText(/Re-add the source file/)).toBeVisible()
  await uploadFixtures(page, ['one-run.tcx'])
  const restored = await openFirstActivity(page)
  await expect(restored.getByRole('textbox', { name: 'Start time', exact: true })).toBeVisible()
  await expect(await activitiesRows(page)).toHaveCount(1)
})

test('sample details are available without persisting sample recordings', async ({ page }) => {
  await openSample(page)
  const workbench = await openFirstActivity(page)
  await expect(workbench.getByRole('textbox', { name: 'Start time', exact: true })).toBeVisible()
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('rca-workbench-evidence', 2)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<number>((resolve, reject) => {
        const request = db.transaction('traces').objectStore('traces').count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  })
  expect(saved).toBe(0)
})

/** An account save can take a while on a loaded machine, as in account.spec.ts. */
const SAVED = { timeout: 30_000 }

/**
 * Waits for the signed-in header, so the account's saved units apply before the setup dialog reads
 * them: a weight typed earlier can be shown in the other unit and refused.
 */
async function waitForAccount(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Workbench', exact: true })).toBeVisible()
}

test('an account original is read only on request, and account deletion removes its recording', async ({
  page,
}) => {
  const email = uniqueEmail()
  await page.goto('/')
  await signInAs(page.request, email, 'Workbench original')
  await enableFileRetention(page.request)
  await page.reload()
  await waitForAccount(page)
  await uploadFixtures(page, ['one-run.tcx'])
  await expect.poll(async () => (await apiActivities(page.request))[0]?.hasFile, SAVED).toBe(true)
  await page.goto('/privacy')
  await removeRecordingCache(page)
  await page.goto('/')
  let downloads = 0
  page.on('request', (request) => {
    if (
      request.method() === 'GET' &&
      /\/api\/activities\/[^/]+\/file$/.test(new URL(request.url()).pathname)
    )
      downloads++
  })
  const workbench = await openFirstActivity(page)
  await expect(workbench.getByRole('button', { name: 'Read original file' })).toBeVisible()
  expect(downloads).toBe(0)
  await workbench.getByRole('button', { name: 'Read original file' }).click()
  await expect(workbench.getByRole('textbox', { name: 'Start time', exact: true })).toBeVisible()
  expect(downloads).toBe(1)

  await goTo(page, 'Profile')
  await page.getByRole('button', { name: 'Delete account…' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Delete your account?' })
  await dialog.getByLabel('Email address').fill(email)
  await dialog.getByRole('button', { name: 'Delete account', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'How balanced are you as an athlete?', exact: true }),
  ).toBeVisible()
  const cache = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('rca-workbench-evidence', 2)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = db.transaction(['traces', 'owners'])
    const count = (store: string) =>
      new Promise<number>((resolve, reject) => {
        const request = transaction.objectStore(store).count()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    try {
      return await Promise.all([count('traces'), count('owners')])
    } finally {
      db.close()
    }
  })
  expect(cache).toEqual([0, 1])
})

test('a second account cannot read another account’s cached trace for the same digest', async ({
  page,
}) => {
  await page.goto('/')
  await signInAs(page.request, uniqueEmail(), 'Workbench first')
  await page.reload()
  await waitForAccount(page)
  await uploadFixtures(page, ['one-run.tcx'])
  await expect.poll(async () => (await apiActivities(page.request)).length, SAVED).toBe(1)
  const [record] = await apiActivities(page.request)
  const first = await openFirstActivity(page)
  await expect(first.getByRole('textbox', { name: 'Start time', exact: true })).toBeVisible()
  await page.goto('/privacy')
  await signInAs(page.request, uniqueEmail(), 'Workbench second')
  const response = await page.request.post('/api/activities', {
    headers: CLIENT_HEADERS,
    data: {
      digest: record!.digest,
      fileName: record!.fileName,
      fileHash: createHash('sha256')
        .update(await readFile(fixturePath('one-run.tcx')))
        .digest('hex'),
    },
  })
  expect(response.status()).toBe(201)
  await page.goto('/')
  const second = await openFirstActivity(page)
  await expect(second.getByText(/Re-add the source file/)).toBeVisible()
  await expect(second.getByRole('textbox')).toHaveCount(0)
})
