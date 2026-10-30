import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
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

test('an import that was cut off by a closed tab is said to have stopped when the page loads again', async ({
  page,
}) => {
  await page.goto('/')
  // What a tab closed mid-import leaves: a manifest still running, whose lock no tab holds.
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('rca-import-meta', 1)
        open.onupgradeneeded = () => open.result.createObjectStore('manifests', { keyPath: 'id' })
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('manifests', 'readwrite')
          tx.objectStore('manifests').put({
            id: 'cut-off',
            scope: 'device',
            startedAt: Date.now() - 60_000,
            updatedAt: Date.now() - 50_000,
            sources: [{ name: 'export.zip', size: 1 }],
            expected: 3_639,
            read: 1_204,
            damaged: [],
            state: 'running',
          })
          tx.oncomplete = () => resolve()
        }
      }),
  )
  await page.reload()

  const notice = page.getByRole('status').filter({ hasText: 'stopped after 1,204 of 3,639 files' })
  await expect(notice).toBeVisible()
  await notice.getByRole('button', { name: 'Use what I have' }).click()
  await expect(page.getByText('stopped after 1,204')).toHaveCount(0)
})
