import { expect, test } from '@playwright/test'
import type { Request } from '@playwright/test'

/**
 * The account lookup on a load is one request that finishes. A probe once saw `/api/me` listed as aborted on every
 * load; this holds the count at one and the abort at none, so a second request (a lookup repeated by a remount) or a
 * request the app cancels itself would show here. A request counts as cancelled only when it never got its response:
 * Chromium also reports a request whose body was read in full as aborted (net::ERR_ABORTED), as often as 2 loads in 5
 * under load, for a plain fetch that reads to the end.
 */
test('a load asks /api/me once, and the request is not aborted', async ({ page }) => {
  const asked: string[] = []
  const failed: Request[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/me') asked.push(request.method())
  })
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname === '/api/me') failed.push(request)
  })
  await page.goto('/')
  // The lookup ends in a sign-in button for a visitor with no account.
  await expect(page.getByRole('button', { name: /Sign in/ }).first()).toBeVisible()
  // Past the instant of a late duplicate (a remount, a refresh on focus).
  await page.waitForTimeout(1_500)
  expect(asked).toEqual(['GET'])
  const unanswered = await Promise.all(
    failed.map(async (r) => ((await r.response()) ? null : r.url())),
  )
  expect(unanswered.filter((url) => url !== null)).toEqual([])
})
