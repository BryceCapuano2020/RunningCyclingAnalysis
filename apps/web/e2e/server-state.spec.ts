import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Me } from '@rca/contract'
import { BALANCE_TITLE, signInAs, trackErrors, uniqueEmail, uploadFixtures } from './helpers.js'

const TWO_WORKOUTS = ['one-ride.gpx', 'one-run.tcx']
/** The queue waits ten seconds, and the local consumer batches for five more. */
const SNAPSHOT_READY = { timeout: 60_000 }

async function userId(page: Page): Promise<string> {
  const response = await page.request.get('/api/me')
  return ((await response.json()) as Me).user.id
}

/** What rca-state holds for a scope (who made it and when), or null. Never makes the database. */
function copyOf(page: Page, scope: string): Promise<{ buildSha: string; nowMs: number } | null> {
  return page.evaluate(async (wanted) => {
    if (!(await indexedDB.databases()).some((database) => database.name === 'rca-state'))
      return null
    return new Promise<{ buildSha: string; nowMs: number } | null>((resolve) => {
      const open = indexedDB.open('rca-state')
      open.onerror = () => resolve(null)
      open.onsuccess = () => {
        const db = open.result
        const read = db.transaction('snapshots').objectStore('snapshots').get(wanted)
        read.onsuccess = () => {
          db.close()
          resolve(read.result?.snapshot ?? null)
        }
      }
    })
  }, scope)
}

async function dropCopies(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('rca-state')
        request.onsuccess = request.onerror = request.onblocked = () => resolve()
      }),
  )
}

/** Signs in and imports two workouts, and waits until the results stand and a device copy is kept. */
async function signedInWithLibrary(page: Page): Promise<string> {
  await signInAs(page.request, uniqueEmail(), 'Ada Lovelace')
  await page.goto('/')
  await uploadFixtures(page, TWO_WORKOUTS)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  const id = await userId(page)
  await expect.poll(() => copyOf(page, id)).not.toBeNull()
  return id
}

/** Holds the analysis worker's script back, so only a copy can be on screen. Returns the way to let it run. */
async function holdWorker(page: Page): Promise<() => void> {
  let release = (): void => undefined
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route(/worker[^/]*\.js(\?.*)?$/, async (route) => {
    await held
    await route.continue()
  })
  return release
}

test('a device with no copy opens on the results the server computed', async ({ page }) => {
  test.setTimeout(150_000)
  const errors = trackErrors(page)
  const id = await signedInWithLibrary(page)

  await expect
    .poll(async () => (await page.request.get('/api/state')).status(), SNAPSHOT_READY)
    .toBe(200)
  // The browser told the server its zone, so the server cut the days where the athlete is.
  const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const settings = (await (await page.request.get('/api/settings')).json()) as { zone?: string }
  expect(settings.zone).toBe(zone)

  await dropCopies(page)
  const release = await holdWorker(page)
  await page.reload()

  // No analysis has run in this page, and the device has no copy: what is shown is the server's.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect.poll(async () => (await copyOf(page, id))?.buildSha).not.toBe('device')
  expect((await copyOf(page, id))?.buildSha).toBeTruthy()

  release()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  expect(errors).toEqual([])
})
