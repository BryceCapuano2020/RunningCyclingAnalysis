import { expect, test } from '@playwright/test'
import { activitiesRows, uploadFixtures } from './helpers.js'

test('a refused detail-cache write preserves analysis and the saved activity summary', async ({
  page,
}) => {
  await page.route('**/analysis.worker-*.js', async (route) => {
    const response = await route.fetch()
    const fault = `const originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args) {
        if (this.name === 'traces') throw new DOMException('Test cache quota', 'QuotaExceededError');
        return originalPut.apply(this, args);
      };\n`
    await route.fulfill({ response, body: fault + (await response.text()) })
  })
  await page.goto('/')
  await uploadFixtures(page, ['one-run.tcx'])
  const rows = await activitiesRows(page)
  await rows.first().getByRole('link').click()
  await expect(page.getByRole('textbox', { name: 'Start time', exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText(/Re-add the source file/)).toBeVisible()
  await expect(await activitiesRows(page)).toHaveCount(1)
})

test('a corrupt byte ledger is repaired before further detail recordings are stored', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-run.tcx'])
  await expect(await activitiesRows(page)).toHaveCount(1)
  await page.goto('/privacy')
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('rca-workbench-evidence', 2)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['entries', 'state'], 'readwrite')
        transaction.oncomplete = () => resolve()
        transaction.onabort = () => reject(transaction.error)
        const entries = transaction.objectStore('entries')
        const request = entries.openCursor()
        request.onsuccess = () => {
          const cursor = request.result
          if (cursor) cursor.update({ ...cursor.value, bytes: 'corrupt' })
        }
        transaction.objectStore('state').put({ key: 'total', bytes: Number.NaN, count: 1 })
      })
    } finally {
      db.close()
    }
  })
  await page.goto('/')
  const rows = await activitiesRows(page)
  await rows.first().getByRole('link').click()
  await expect(page.getByText(/Re-add the source file/)).toBeVisible()
  await uploadFixtures(page, ['one-run.tcx'])
  const restored = await activitiesRows(page)
  await restored.first().getByRole('link').click()
  await expect(page.getByRole('textbox', { name: 'Start time', exact: true })).toBeVisible()
  const accounting = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('rca-workbench-evidence', 2)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const transaction = db.transaction(['entries', 'state'])
    const get = (store: string, key?: string) =>
      new Promise<unknown>((resolve, reject) => {
        const request =
          key === undefined
            ? transaction.objectStore(store).getAll()
            : transaction.objectStore(store).get(key)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    try {
      return await Promise.all([get('entries'), get('state', 'total')])
    } finally {
      db.close()
    }
  })
  const [entries, state] = accounting as [{ bytes: number }[], { bytes: number; count: number }]
  expect(Number.isFinite(state.bytes)).toBe(true)
  expect(state.bytes).toBe(entries.reduce((sum, entry) => sum + entry.bytes, 0))
  expect(state.count).toBe(entries.length)
  expect(state.bytes).toBeLessThanOrEqual(64 * 1024 * 1024)
})
