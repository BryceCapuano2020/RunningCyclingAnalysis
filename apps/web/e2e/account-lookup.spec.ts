import { expect, test } from '@playwright/test'

/**
 * The account lookup on a load is one request that finishes. A probe once saw `/api/me` listed as aborted on every
 * load; this holds the count at one and the abort at none, so a second request (a lookup repeated by a remount) or a
 * request the app cancels itself would show here.
 */
test('a load asks /api/me once, and the request is not aborted', async ({ page }) => {
  const asked: string[] = []
  const failed: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/me') asked.push(request.method())
  })
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname === '/api/me') {
      failed.push(request.failure()?.errorText ?? 'failed')
    }
  })
  await page.goto('/')
  // The lookup ends in a sign-in button for a visitor with no account.
  await expect(page.getByRole('button', { name: /Sign in/ }).first()).toBeVisible()
  // Past the instant of a late duplicate (a remount, a refresh on focus).
  await page.waitForTimeout(1_500)
  expect(asked).toEqual(['GET'])
  expect(failed).toEqual([])
})
