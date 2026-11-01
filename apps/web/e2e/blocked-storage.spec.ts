import { expect, test } from '@playwright/test'
import { BALANCE_TITLE, uploadFixtures } from './helpers.js'

/**
 * A browser that refuses site storage (a strict privacy setting, a locked-down profile) makes `indexedDB` and
 * `localStorage` throw when the page touches them. The app works without them, so nothing should go uncaught: an
 * unhandled rejection reaches the console and every error report as if the page were broken.
 */
test('with storage refused, a load, an import and a reload raise no unhandled error', async ({
  page,
}) => {
  const uncaught: string[] = []
  page.on('pageerror', (error) => uncaught.push(error.message))
  await page.addInitScript(() => {
    const refuse = (): never => {
      throw new DOMException('blocked', 'SecurityError')
    }
    Object.defineProperty(window, 'indexedDB', { configurable: true, get: refuse })
    Object.defineProperty(window, 'localStorage', { configurable: true, get: refuse })
  })

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await uploadFixtures(page, ['one-run.tcx'], undefined, { settled: false })
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  // Rejections are reported a tick after the code that raised them.
  await page.waitForTimeout(1_000)
  expect(uncaught).toEqual([])
})
