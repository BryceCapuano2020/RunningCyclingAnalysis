import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
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
  await expect(page.getByText(/Add this activity's file again/)).toBeVisible()
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
      const request = indexedDB.open('rca-workbench-evidence', 3)
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
  await expect(page.getByText(/Add this activity's file again/)).toBeVisible()
  await uploadFixtures(page, ['one-run.tcx'])
  const restored = await activitiesRows(page)
  await restored.first().getByRole('link').click()
  await expect(page.getByRole('textbox', { name: 'Start time', exact: true })).toBeVisible()
  const accounting = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('rca-workbench-evidence', 3)
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

const TOTAL = 64 * 1024 * 1024
const DAY_MS = 24 * 60 * 60 * 1000
const JUNE_1 = Date.UTC(2025, 5, 1)

/**
 * Fills the recording cache to its byte limit with eight made-up recordings, seeded-0 to seeded-7,
 * started a day apart from `firstStartMs`. The first is saved last, so only the activity start can
 * tell it is the oldest.
 */
async function fillCache(page: Page, firstStartMs: number): Promise<void> {
  await page.evaluate(
    async ({ total, day, from }) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('rca-workbench-evidence', 3)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction(['entries', 'state'], 'readwrite')
          transaction.oncomplete = () => resolve()
          transaction.onabort = () => reject(transaction.error)
          const entries = transaction.objectStore('entries')
          const held = entries.getAll()
          held.onsuccess = () => {
            const real = (held.result as { bytes: number }[]).reduce((sum, e) => sum + e.bytes, 0)
            const each = Math.floor(total / 8)
            for (let i = 0; i < 8; i++) {
              entries.put({
                key: JSON.stringify(['device', 'seeded-' + i]),
                scopeKey: 'device',
                activityId: 'seeded-' + i,
                startMs: from + i * day,
                savedAt: Date.now() - i,
                bytes: i === 0 ? total - real - each * 7 : each,
              })
            }
            const count = 8 + held.result.length
            transaction.objectStore('state').put({ key: 'total', bytes: total, count })
          }
        })
      } finally {
        db.close()
      }
    },
    { total: TOTAL, day: DAY_MS, from: firstStartMs },
  )
}

async function cacheRows(page: Page) {
  const [entries, [state]] = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('rca-workbench-evidence', 3)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const transaction = db.transaction(['entries', 'state'])
      const all = (store: string) =>
        new Promise<unknown[]>((resolve, reject) => {
          const request = transaction.objectStore(store).getAll()
          request.onsuccess = () => resolve(request.result)
          request.onerror = () => reject(request.error)
        })
      return await Promise.all([all('entries'), all('state')])
    } finally {
      db.close()
    }
  })
  return {
    entries: entries as { activityId: string; bytes: number }[],
    state: state as { bytes: number },
  }
}

test('a full recording cache drops the oldest activities first, however recently they were saved', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-run.tcx'])
  await expect(await activitiesRows(page)).toHaveCount(1)
  await page.goto('/privacy')
  // Eight recordings of activities from 1 to 8 June, which fill the cache. The run is of 13 June.
  await fillCache(page, JUNE_1)
  await page.goto('/')
  await uploadFixtures(page, ['one-ride.gpx'])
  await expect(await activitiesRows(page)).toHaveCount(2, { timeout: 15_000 })
  await page.goto('/privacy')
  const { entries, state } = await cacheRows(page)
  const ids = entries.map((entry) => entry.activityId)
  expect(ids).not.toContain('seeded-0')
  expect(ids).toContain('seeded-1')
  expect(ids).toContain('seeded-7')
  expect(ids).toContain('1749798900000-one-run.tcx')
  expect(ids).toHaveLength(9)
  expect(state.bytes).toBe(entries.reduce((sum, entry) => sum + entry.bytes, 0))
  expect(state.bytes).toBeLessThanOrEqual(TOTAL)
})

test('an older activity added to a cache full of newer ones is not stored, and still opens', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-ride.gpx'])
  await expect(await activitiesRows(page)).toHaveCount(1)
  await page.goto('/privacy')
  // Eight recordings of activities from 2030, which fill the cache. The ride is of 14 June 2025.
  await fillCache(page, Date.UTC(2030, 0, 1))
  await page.goto('/')
  await uploadFixtures(page, ['one-run.tcx'])
  const rows = await activitiesRows(page)
  await expect(rows).toHaveCount(2, { timeout: 15_000 })
  // The older run is the second row. Its recording lasts for this visit.
  await rows.nth(1).getByRole('link').click()
  await expect(page.getByRole('textbox', { name: 'Start time', exact: true })).toBeVisible()

  await page.goto('/privacy')
  const { entries, state } = await cacheRows(page)
  const ids = entries.map((entry) => entry.activityId)
  expect(ids).not.toContain('1749798900000-one-run.tcx')
  expect(ids).toContain('seeded-0')
  expect(ids).toContain('seeded-7')
  expect(ids.some((id) => id.endsWith('one-ride.gpx'))).toBe(true)
  expect(ids).toHaveLength(9)
  expect(state.bytes).toBeLessThanOrEqual(TOTAL)

  await page.goto('/')
  const reloaded = await activitiesRows(page)
  await reloaded.nth(1).getByRole('link').click()
  await expect(page.getByText(/Add this activity's file again/)).toBeVisible()
})

test('a recording cache from before recordings were ranked is rebuilt and keeps account tombstones', async ({
  page,
}) => {
  await page.goto('/privacy')
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('rca-workbench-evidence', 2)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('traces', { keyPath: 'key' })
        const entries = db.createObjectStore('entries', { keyPath: 'key' })
        entries.createIndex('scopeKey', 'scopeKey')
        entries.createIndex('savedAt', 'savedAt')
        db.createObjectStore('state', { keyPath: 'key' })
        db.createObjectStore('owners', { keyPath: 'scopeKey' })
        const key = JSON.stringify(['device', 'old'])
        entries.put({ key, scopeKey: 'device', activityId: 'old', savedAt: 1, bytes: 10 })
        request.transaction!.objectStore('traces').put({ key })
        request.transaction!.objectStore('state').put({ key: 'total', bytes: 10, count: 1 })
        request.transaction!.objectStore('owners').put({ scopeKey: 'account:gone', deletedAt: 1 })
      }
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })
  })
  await page.goto('/')
  await uploadFixtures(page, ['one-run.tcx'])
  await expect(await activitiesRows(page)).toHaveCount(1, { timeout: 15_000 })
  await page.goto('/privacy')
  const { entries, state } = await cacheRows(page)
  expect(entries.map((entry) => entry.activityId)).toEqual(['1749798900000-one-run.tcx'])
  expect(state.bytes).toBe(entries[0]!.bytes)
  const owners = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('rca-workbench-evidence', 3)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      return await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction('owners').objectStore('owners').getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    } finally {
      db.close()
    }
  })
  expect(owners).toEqual([{ scopeKey: 'account:gone', deletedAt: 1 }])
})
