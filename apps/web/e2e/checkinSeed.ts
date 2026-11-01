import type { Page } from '@playwright/test'
import { MODEL_REVISION } from '@rca/core/digest/modelRevision'

/** Puts a baseline of an empty library, taken ten hours ago, in the check-in database for the device. */
export async function seedBaseline(page: Page): Promise<void> {
  await page.evaluate(
    ({ revision }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('rca-checkin', 1)
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const at = Date.now() - 10 * 3_600_000
          const tx = open.result.transaction('marks', 'readwrite')
          tx.objectStore('marks').put(
            {
              v: 1,
              baseline: {
                v: 1,
                revision,
                atMs: at,
                asOfMs: 0,
                keys: { run: '', ride: '' },
                counts: { run: 0, ride: 0 },
                bests: { run: [], ride: [] },
                fitness: { run: null, ride: null },
                episodes: { run: [], ride: [] },
              },
              lastImportAtMs: at,
              pending: null,
            },
            'device',
          )
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    { revision: MODEL_REVISION },
  )
}
