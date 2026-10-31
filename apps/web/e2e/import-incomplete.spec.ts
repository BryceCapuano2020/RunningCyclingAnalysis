import { readFile } from 'node:fs/promises'
import { zipSync } from 'fflate'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { BALANCE_TITLE, completeSetup, fixturePath } from './helpers.js'

/** The export zip cut short, as a download that stopped would leave it. */
async function truncatedExport(): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const whole = await readFile(fixturePath('sample-export.zip'))
  return {
    name: 'export.zip',
    mimeType: 'application/zip',
    buffer: whole.subarray(0, whole.length * 0.6),
  }
}

test('a zip that ends early is said to be missing files, and the notice goes when the athlete goes on', async ({
  page,
}) => {
  await page.goto('/')
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(await truncatedExport())
  await completeSetup(page)

  const notice = page.getByRole('status').filter({ hasText: 'Download the export again' })
  await expect(notice).toBeVisible({ timeout: 30_000 })
  await expect(notice).toContainText('export.zip')

  await notice.getByRole('button', { name: 'Use what I have' }).click()
  await expect(page.getByText('Download the export again')).toHaveCount(0)

  // The choice is kept: a reload does not bring the notice back.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string[]>((resolve) => {
            const open = indexedDB.open('rca-import-meta')
            open.onsuccess = () => {
              const all = open.result.transaction('manifests').objectStore('manifests').getAll()
              all.onsuccess = () => resolve((all.result as { state: string }[]).map((m) => m.state))
            }
          }),
      ),
    )
    .toEqual(['accepted-partial'])
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect(page.getByText('Download the export again')).toHaveCount(0)
})

/** How many copies of one run the large export holds: enough that reading it takes the test several steps. */
const PADDING = ' '.repeat(Number(process.env.E2E_PAD ?? 1_000_000))
const LARGE_EXPORT_FILES = Number(process.env.E2E_LARGE_EXPORT_FILES ?? 600)

/**
 * A big export zip, as one that takes a while to read. Each file is the same run with its own trailing
 * comment, so none is skipped as a byte-for-byte copy and each is read in full.
 */
async function largeExport(): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const run = await readFile(fixturePath('one-run.tcx'), 'utf8')
  const files: Record<string, Uint8Array> = {}
  for (let i = 0; i < LARGE_EXPORT_FILES; i++) {
    files[`activities/${i}.tcx`] = new TextEncoder().encode(`${run}\n<!-- ${i}${PADDING} -->\n`)
  }
  return {
    name: 'large-export.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from(zipSync(files, { level: 1 })),
  }
}

interface Recorded {
  state: string
  read: number
  expected: number | null
}

/** The import records this browser holds, as the page keeps them. */
function recordedImports(page: Page): Promise<Recorded[]> {
  return page.evaluate(
    () =>
      new Promise<Recorded[]>((resolve) => {
        const open = indexedDB.open('rca-import-meta')
        open.onerror = () => resolve([])
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.contains('manifests')) {
            db.close()
            resolve([])
            return
          }
          const all = db.transaction('manifests').objectStore('manifests').getAll()
          all.onsuccess = () => {
            db.close()
            resolve(all.result as Recorded[])
          }
        }
      }),
  )
}

/** Starts the large import in a page and waits until it has read some of it, so it is cut off part of the way. */
async function startLargeImport(page: Page): Promise<void> {
  await page.goto('/')
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles(await largeExport())
  await completeSetup(page)
  await expect
    .poll(
      async () => (await recordedImports(page)).some((m) => m.state === 'running' && m.read > 0),
      {
        timeout: 30_000,
      },
    )
    .toBe(true)
}

const STOPPED_NOTICE = /The last import stopped/

test('a tab closed in the middle of an import is said to have stopped, in the next page that loads', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const importing = await context.newPage()
  await startLargeImport(importing)

  // The tab goes without a chance to finish or to write anything more.
  await importing.close({ runBeforeUnload: false })

  const next = await context.newPage()
  await next.goto('/')
  const notice = next.getByRole('status').filter({ hasText: STOPPED_NOTICE })
  await expect(notice).toBeVisible({ timeout: 30_000 })
  await expect(notice).toContainText('Add the same files again')
  expect((await recordedImports(next)).map(({ state }) => state)).toEqual(['interrupted'])

  await notice.getByRole('button', { name: 'Use what I have' }).click()
  await expect(next.getByText('The last import stopped')).toHaveCount(0)
  await context.close()
})

test('a second tab that opens while the first is still importing does not call the import cut off', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const importing = await context.newPage()
  await startLargeImport(importing)

  const second = await context.newPage()
  await second.goto('/')
  await expect(second.getByRole('heading', { level: 1 })).toBeVisible()
  // The second page has had time to look at the record and the locks: it left the record running.
  await second.waitForTimeout(1_500)
  expect((await recordedImports(second)).map(({ state }) => state)).toEqual(['running'])
  await expect(second.getByText(STOPPED_NOTICE)).toHaveCount(0)
  await expect(importing.getByText(STOPPED_NOTICE)).toHaveCount(0)

  // When the import ends, it ends as complete, and neither tab has anything to say.
  await expect
    .poll(async () => (await recordedImports(second)).map(({ state }) => state), {
      timeout: 55_000,
    })
    .toEqual(['complete'])
  await expect(second.getByText(STOPPED_NOTICE)).toHaveCount(0)
  await context.close()
})
