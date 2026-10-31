import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import {
  apiActivities,
  enableFileRetention,
  signInAs,
  uniqueEmail,
  uploadFixtures,
} from './helpers.js'

const WAITING = 'Too many requests at once'
const FILE = '**/api/activities/*/file'

/** The edge limiter's answer, as production gives it, with a Retry-After of one second so a test need not wait a minute. */
function refused(route: Route) {
  return route.fulfill({
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': '1' },
    body: JSON.stringify({
      error: { code: 'rate_limited', message: 'Too many requests. Please try again shortly' },
    }),
  })
}

async function signedInKeepingFiles(page: Page) {
  await signInAs(page.request, uniqueEmail(), 'Ada Lovelace')
  await enableFileRetention(page.request)
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Ada', exact: true })).toBeVisible()
}

/** The list counts against a daily read budget, so it is read at long intervals. */
const hasFile = (page: Page) => async () => (await apiActivities(page.request))[0]?.hasFile

test('an original the limiter refuses once is sent again after the Retry-After, with nothing added again', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signedInKeepingFiles(page)
  let refusals = 0
  await page.route(FILE, (route) => {
    if (route.request().method() === 'PUT' && refusals < 1) {
      refusals++
      return refused(route)
    }
    return route.continue()
  })

  await uploadFixtures(page, ['one-run.fit'])

  await expect.poll(hasFile(page), { timeout: 60_000, intervals: [3_000] }).toBe(true)
  expect(refusals).toBe(1)
  await expect(page.getByText(WAITING)).toHaveCount(0)
})

test('an original the limiter keeps refusing is told, the activity is kept without it, and adding the file again keeps it', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signedInKeepingFiles(page)
  let sent = 0
  await page.route(FILE, (route) => {
    if (route.request().method() !== 'PUT') return route.continue()
    sent++
    return refused(route)
  })

  await uploadFixtures(page, ['one-run.fit'])

  await expect(page.getByText(WAITING)).toBeVisible({ timeout: 30_000 })
  // The first try and the one more after the Retry-After.
  expect(sent).toBe(2)
  expect((await apiActivities(page.request))[0]?.hasFile).toBe(false)

  await page.unroute(FILE)
  await uploadFixtures(page, ['one-run.fit'])
  await expect.poll(hasFile(page), { timeout: 60_000, intervals: [3_000] }).toBe(true)
})
