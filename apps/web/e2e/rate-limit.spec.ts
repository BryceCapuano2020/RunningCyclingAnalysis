import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import {
  apiActivities,
  enableFileRetention,
  signInAs,
  uniqueEmail,
  uploadFixtures,
} from './helpers.js'

const NAME = 'Ada Lovelace'
const WAITING = 'Too many requests at once'
/** The wait and the second try take a few seconds; the rest is the import. */
const SAVED = { timeout: 30_000 }

/**
 * The local API skips the edge rate limiter (it only exists on Cloudflare), so the browser meets the limiter's answer
 * the way production gives it: 429 `rate_limited` with a Retry-After of its own, here one second so a test need not
 * wait a minute. These tests follow what the person sees and what is saved, not the worker's internals.
 */
function refused(route: Route) {
  return route.fulfill({
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': '1' },
    body: JSON.stringify({
      error: { code: 'rate_limited', message: 'Too many requests. Please try again shortly' },
    }),
  })
}

const isCreate = (route: Route) => route.request().method() === 'POST'

async function signedInAtHome(page: Page) {
  await signInAs(page.request, uniqueEmail(), NAME)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Ada', exact: true })).toBeVisible()
}

test('an import waits out one rate-limited save and saves the activity without a notice', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signedInAtHome(page)
  let refusals = 0
  await page.route('**/api/activities', async (route) => {
    if (isCreate(route) && refusals < 1) {
      refusals++
      return refused(route)
    }
    return route.continue()
  })

  await uploadFixtures(page, ['one-run.fit'])

  await expect.poll(async () => (await apiActivities(page.request)).length, SAVED).toBe(1)
  expect(refusals).toBe(1)
  await expect(page.getByText(WAITING)).toHaveCount(0)
})

test('a rate limit that holds says so, keeps the activity waiting, and a later visit saves it', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signedInAtHome(page)
  let sent = 0
  await page.route('**/api/activities', async (route) => {
    if (isCreate(route)) {
      sent++
      return refused(route)
    }
    return route.continue()
  })

  await uploadFixtures(page, ['one-run.fit'])

  // The save is tried, waited for and tried once more, and then the page says what happened.
  await expect(page.getByText(WAITING)).toBeVisible(SAVED)
  expect(sent).toBeGreaterThanOrEqual(2)
  expect(await apiActivities(page.request)).toHaveLength(0)

  // The limit lifts. The activity was written to the browser's outbox before it was sent, so the next visit finishes it.
  await page.unroute('**/api/activities')
  await page.reload()
  await expect.poll(async () => (await apiActivities(page.request)).length, SAVED).toBe(1)
})

test('a sign-in the edge limiter refuses sends the visitor back with the reason, and the address is cleared', async ({
  page,
}) => {
  // The API answers a browser that is limited on /api/auth/google with a redirect to the app carrying the code alone. A
  // browser may not be handed a fulfilled redirect (WebKit refuses), so a page that makes the same hop stands in for it.
  await page.route('**/api/auth/google', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<script>location.replace("/#/?signin=rate_limited")</script>',
    }),
  )
  await page.goto('/')
  await page.getByRole('banner').getByRole('button', { name: 'Sign in with Google' }).click()

  await expect(page.getByText(/^Too many sign-in attempts from this network/)).toBeVisible()
  await expect(page).toHaveURL(/#\/$/)
  expect(await apiActivities(page.request).catch(() => [])).toHaveLength(0)
})

test('an original the limiter refuses is told, the activity is kept without it, and adding the file again keeps it', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signInAs(page.request, uniqueEmail(), NAME)
  await enableFileRetention(page.request)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Ada', exact: true })).toBeVisible()
  await page.route('**/api/activities/*/file', (route) =>
    route.request().method() === 'PUT' ? refused(route) : route.continue(),
  )

  await uploadFixtures(page, ['one-run.fit'])

  // The summary is saved; only the original is missing, and the page says why.
  await expect(page.getByText(WAITING)).toBeVisible(SAVED)
  const [saved] = await apiActivities(page.request)
  expect(saved?.hasFile).toBe(false)

  // The limit lifts; the file added again is kept. The list is read sparingly: it counts against a daily read budget.
  await page.unroute('**/api/activities/*/file')
  await uploadFixtures(page, ['one-run.fit'])
  await expect
    .poll(async () => (await apiActivities(page.request))[0]?.hasFile, {
      timeout: 60_000,
      intervals: [3_000],
    })
    .toBe(true)
})
