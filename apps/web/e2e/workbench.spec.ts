import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Locator, Page } from '@playwright/test'
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
  const brushStart = workbench.getByRole('slider', { name: 'Selection start' })
  await expect(brushStart).toBeVisible()
  // The brush is the way to select; the typed times, behind a disclosure, set an end to the second.
  await workbench.getByText('Set by time').click()
  const start = workbench.getByRole('textbox', { name: 'Start time', exact: true })
  const end = workbench.getByRole('textbox', { name: 'End time', exact: true })
  const whole = Number(
    await workbench.getByRole('slider', { name: 'Selection end' }).getAttribute('aria-valuemax'),
  )
  await end.fill('0:30')
  await end.press('Enter')
  await start.fill('0:10')
  await start.press('Enter')
  await expect(workbench.getByText('Elapsed time').locator('..')).toContainText('20 s')
  await expect(brushStart).toHaveAttribute('aria-valuenow', '10')
  await brushStart.focus()
  await page.keyboard.press('ArrowRight')
  // An arrow moves an end by a two-hundredth of the activity, a second at least.
  const step = Math.max(1, Math.round(whole / 200))
  await expect(brushStart).toHaveAttribute('aria-valuenow', String(10 + step))
  await expect(start).toHaveValue(`0:${String(10 + step).padStart(2, '0')}`)
  await expect(
    workbench.getByRole('table', { name: /while moving in the selected interval/i }),
  ).toBeVisible()
  await expect(workbench.locator('.ts-stack svg.chart-frame__svg')).toBeVisible()

  await page.reload()
  await expect(brushStart).toHaveAttribute('aria-valuenow', '0')
  await expect(workbench.locator('.ts-stack svg.chart-frame__svg')).toBeVisible()
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
  await expect(workbench.getByText(/Add this activity's file again/)).toBeVisible()
  await uploadFixtures(page, ['one-run.tcx'])
  await expect(page.getByText(/Detail restored for 1 activity/).first()).toBeVisible()
  const restored = await openFirstActivity(page)
  await expect(restored.getByRole('slider', { name: 'Selection start' })).toBeVisible()
  await expect(await activitiesRows(page)).toHaveCount(1)
})

test('sample details are available without persisting sample recordings', async ({ page }) => {
  await openSample(page)
  const workbench = await openFirstActivity(page)
  await expect(workbench.getByRole('slider', { name: 'Selection start' })).toBeVisible()
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('rca-workbench-evidence', 3)
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
  await expect(workbench.getByRole('slider', { name: 'Selection start' })).toBeVisible()
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
      const request = indexedDB.open('rca-workbench-evidence', 3)
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
  await expect(first.getByRole('slider', { name: 'Selection start' })).toBeVisible()
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
  await expect(second.getByText(/Add this activity's file again/)).toBeVisible()
  await expect(second.getByRole('slider')).toHaveCount(0)
})

test('the timeline of an activity stays under 700 px at 390 px wide, and the brush and the cursor work by keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSample(page)
  const workbench = await openFirstActivity(page)
  const plot = workbench.getByRole('group', { name: /over time$/ })
  await expect(plot).toBeVisible()
  const edges = async (locator: Locator) => {
    const box = await locator.boundingBox()
    if (box === null) throw new Error('no box')
    return { top: box.y, bottom: box.y + box.height }
  }
  // From the measure chips to the foot of the brush: everything that sets and shows the interval.
  const top = (await edges(workbench.locator('.activity-workbench__metrics'))).top
  const bottom = (await edges(workbench.locator('.ts-brush'))).bottom
  expect(bottom - top).toBeLessThanOrEqual(700)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0)

  await plot.focus()
  await page.keyboard.press('ArrowRight')
  await expect(workbench.getByRole('status').first()).toContainText('Elapsed')
  await page.keyboard.press('End')
  await expect(workbench.getByRole('status').first()).not.toContainText('Elapsed0:00')
  await page.keyboard.press('Escape')
  await expect(workbench.getByRole('status').first()).toContainText('Average')
})
