import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { activitiesRows, uploadFixtures } from './helpers.js'
import {
  CACHE_BYTES,
  CACHE_ENTRIES,
  DAY_MS,
  exactLedger,
  readCache,
  seedCache,
  type SeededEntry,
} from './recordingCache.js'

const JUNE_1 = Date.UTC(2025, 5, 1)
const JUNE_20 = Date.UTC(2025, 5, 20)
const YEAR_2030 = Date.UTC(2030, 0, 1)
/** one-ride.gpx and one-run.tcx start on 14 and 13 June 2025; an activity's id begins with its start. */
const RIDE_START = Date.UTC(2025, 5, 14, 6, 30)
const RIDE_ID = `${RIDE_START}-one-ride.gpx`
const RUN_ID = '1749798900000-one-run.tcx'
const MIB = 1024 * 1024
const SLOW = { timeout: 30_000 }

/** Imports one file, so the app creates the cache, then leaves a page that holds no connection to it. */
async function createCacheWith(page: Page, fixture: string): Promise<void> {
  await page.goto('/')
  await uploadFixtures(page, [fixture])
  await expect(await activitiesRows(page)).toHaveCount(1, SLOW)
  await page.goto('/privacy')
}

async function importAgain(page: Page, fixture: string, rows: number): Promise<void> {
  await page.goto('/')
  await uploadFixtures(page, [fixture])
  await expect(await activitiesRows(page)).toHaveCount(rows, SLOW)
  await page.goto('/privacy')
}

/** `count` rows that add up to `bytes` between them, started `stepMs` apart from `from`. */
function filling(
  prefix: string,
  count: number,
  bytes: number,
  from: number,
  stepMs: number,
): SeededEntry[] {
  const each = Math.floor(bytes / count)
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    startMs: from + i * stepMs,
    savedAt: 1_000 + i,
    bytes: i === count - 1 ? bytes - each * (count - 1) : each,
  }))
}

const idsOf = (entries: { activityId: string }[]) => entries.map((entry) => entry.activityId).sort()

test('a full cache drops the oldest activities first, however recently they were saved', async ({
  page,
}) => {
  await createCacheWith(page, 'one-run.tcx')
  // Eight recordings of 1 to 8 June fill the cache. The first was saved last, so only its start ranks it.
  const seeded = filling('seeded', 8, CACHE_BYTES, JUNE_1, DAY_MS)
  seeded.forEach((row, i) => {
    row.savedAt = 100 - i
  })
  await seedCache(page, seeded)
  await importAgain(page, 'one-ride.gpx', 2)

  const { entries, ledger } = await readCache(page)
  expect(idsOf(entries)).toEqual([RIDE_ID, ...seeded.slice(1).map((row) => row.id)].sort())
  expect(ledger).toEqual(exactLedger(entries))
  expect(ledger.bytes).toBeLessThanOrEqual(CACHE_BYTES)
})

test('an older activity added to a cache full of newer ones is not stored, and still opens', async ({
  page,
}) => {
  await createCacheWith(page, 'one-ride.gpx')
  const seeded = filling('seeded', 8, CACHE_BYTES, YEAR_2030, DAY_MS)
  await seedCache(page, seeded)
  await page.goto('/')
  await uploadFixtures(page, ['one-run.tcx'])
  const rows = await activitiesRows(page)
  await expect(rows).toHaveCount(2, SLOW)
  // The older run is the second row. Its recording lasts for this visit.
  await rows.nth(1).getByRole('link').click()
  await expect(page.getByRole('textbox', { name: 'Start time', exact: true })).toBeVisible()

  await page.goto('/privacy')
  const { entries, ledger } = await readCache(page)
  expect(idsOf(entries)).toEqual(idsOf(seeded.map((row) => ({ activityId: row.id }))))
  expect(ledger).toEqual({ bytes: CACHE_BYTES, count: 8 })

  await page.goto('/')
  const reloaded = await activitiesRows(page)
  await reloaded.nth(1).getByRole('link').click()
  await expect(page.getByText(/Add this activity's file again/)).toBeVisible()
})

test('a recording that cannot fit leaves the cache exactly as it was, not half evicted', async ({
  page,
}) => {
  await createCacheWith(page, 'one-run.tcx')
  // A small old recording that the ride's own would outrank, and seven newer ones that fill the rest.
  const old: SeededEntry = { id: 'old', startMs: JUNE_1, savedAt: 1, bytes: 1_000 }
  const seeded = [old, ...filling('newer', 7, CACHE_BYTES - old.bytes, YEAR_2030, DAY_MS)]
  await seedCache(page, seeded)
  // Dropping the old one frees too little for the ride, and the next is of a newer activity.
  await importAgain(page, 'one-ride.gpx', 2)

  const { entries, ledger } = await readCache(page)
  expect(idsOf(entries)).toEqual(idsOf(seeded.map((row) => ({ activityId: row.id }))))
  expect(entries.find((row) => row.activityId === 'old')?.bytes).toBe(1_000)
  expect(ledger).toEqual({ bytes: CACHE_BYTES, count: 8 })
})

test('recordings of activities that start together go oldest-saved first', async ({ page }) => {
  await createCacheWith(page, 'one-run.tcx')
  // Three recordings of the ride's own start, saved in turn, and five of 2030 that fill the cache.
  const tied: SeededEntry[] = [1, 2, 3].map((n) => ({
    id: `tied-${n}`,
    startMs: RIDE_START,
    savedAt: n,
    bytes: MIB,
  }))
  const seeded = [...tied, ...filling('newer', 5, CACHE_BYTES - 3 * MIB, YEAR_2030, DAY_MS)]
  await seedCache(page, seeded)
  await importAgain(page, 'one-ride.gpx', 2)

  const { entries, ledger } = await readCache(page)
  const ids = idsOf(entries)
  expect(ids).not.toContain('tied-1')
  expect(ids).toContain('tied-2')
  expect(ids).toContain('tied-3')
  expect(ids).toContain(RIDE_ID)
  expect(ids).toHaveLength(8)
  expect(ledger).toEqual(exactLedger(entries))
})

test('a cache at its entry limit drops the oldest activity for a newer one', async ({ page }) => {
  await createCacheWith(page, 'one-run.tcx')
  const seeded = filling('seeded', CACHE_ENTRIES, CACHE_ENTRIES, JUNE_1, 1_000)
  await seedCache(page, seeded)
  await importAgain(page, 'one-ride.gpx', 2)

  const { entries, ledger } = await readCache(page)
  expect(entries).toHaveLength(CACHE_ENTRIES)
  expect(idsOf(entries)).not.toContain('seeded-0')
  expect(idsOf(entries)).toContain('seeded-1')
  expect(idsOf(entries)).toContain(RIDE_ID)
  expect(ledger).toEqual(exactLedger(entries))
})

test('a cache at its entry limit leaves out an older activity', async ({ page }) => {
  await createCacheWith(page, 'one-run.tcx')
  const seeded = filling('seeded', CACHE_ENTRIES, CACHE_ENTRIES, JUNE_20, 1_000)
  await seedCache(page, seeded)
  await importAgain(page, 'one-ride.gpx', 2)

  const { entries, ledger } = await readCache(page)
  expect(entries).toHaveLength(CACHE_ENTRIES)
  expect(idsOf(entries)).not.toContain(RIDE_ID)
  expect(idsOf(entries)).toContain('seeded-0')
  expect(ledger).toEqual({ bytes: CACHE_ENTRIES, count: CACHE_ENTRIES })
})

for (const oldVersion of [1, 2]) {
  test(`a version ${oldVersion} cache is rebuilt, and account tombstones are kept`, async ({
    page,
  }) => {
    await page.goto('/privacy')
    await page.evaluate(async (version) => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('rca-workbench-evidence', version)
        request.onupgradeneeded = () => {
          const db = request.result
          const key = JSON.stringify(['device', 'old'])
          const traces = db.createObjectStore('traces', { keyPath: 'key' })
          traces.put({ key, scopeKey: 'device', activityId: 'old', savedAt: 1, bytes: 10 })
          if (version === 1) return
          const entries = db.createObjectStore('entries', { keyPath: 'key' })
          entries.createIndex('scopeKey', 'scopeKey')
          entries.createIndex('savedAt', 'savedAt')
          entries.put({ key, scopeKey: 'device', activityId: 'old', savedAt: 1, bytes: 10 })
          db.createObjectStore('state', { keyPath: 'key' }).put({
            key: 'total',
            bytes: 10,
            count: 1,
          })
          db.createObjectStore('owners', { keyPath: 'scopeKey' }).put({
            scopeKey: 'account:gone',
            deletedAt: 1,
          })
        }
        request.onsuccess = () => {
          request.result.close()
          resolve()
        }
        request.onerror = () => reject(request.error)
      })
    }, oldVersion)
    await createCacheWith(page, 'one-run.tcx')

    const { entries, ledger } = await readCache(page)
    expect(idsOf(entries)).toEqual([RUN_ID])
    expect(ledger).toEqual(exactLedger(entries))
    const owners = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('rca-workbench-evidence')
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
    expect(owners).toEqual(oldVersion === 2 ? [{ scopeKey: 'account:gone', deletedAt: 1 }] : [])
  })
}
