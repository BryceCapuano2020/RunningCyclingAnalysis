/// <reference lib="dom" />
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import type { APIRequestContext, ConsoleMessage, Locator, Page } from '@playwright/test'
import type { ActivityPage, ActivityRecord } from '@rca/contract'

/** Hard-coded text from the landing page; the test suite checks it, so change both together. */
export const LANDING_TITLE = 'Are you a stronger runner or cyclist?'

export const WCAG_TAGS = ['wcag2a', 'wcag2aa']

/** The Activities table only. Chart "View as table" tables are also role=table. */
export function activitiesRows(page: Page): Locator {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Activities', exact: true }) })
    .getByRole('table')
    .locator('tbody tr:not([hidden])')
}

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url))

export function fixturePath(name: string): string {
  return join(FIXTURE_DIR, name)
}

/**
 * The app asks /api/me who is signed in on every load, and the API answers 401 when nobody is.
 * The browser logs that as a console error, so this one expected response is not counted.
 */
function isSignedOutProbe(message: ConsoleMessage): boolean {
  return message.location().url.endsWith('/api/me') && message.text().includes('status of 401')
}

/** Collects console errors and uncaught page errors. Attach before navigating. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && !isSignedOutProbe(message)) errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

export async function openSample(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try sample data' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/running|cycling/i)
}

/** Sends files to the hidden file input. Works from the landing page and the results page. */
export async function uploadFixtures(page: Page, names: string[]): Promise<void> {
  await page.locator('input[type="file"]').first().setInputFiles(names.map(fixturePath))
}

export async function horizontalOverflow(
  page: Page,
): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
}

/** The API rejects every non-GET request without this header (CSRF guard). */
export const CLIENT_HEADERS = { 'X-RCA-Client': 'web' }

/** A fresh email, so each test gets its own account on the shared local database. */
export function uniqueEmail(): string {
  return `e2e-${randomUUID()}@example.com`
}

/**
 * Signs in as a local development user via the API. Cookies set by `request` are shared with the
 * page when `request` is `page.request`, so the browser is signed in too.
 */
export async function signInAs(
  request: APIRequestContext,
  email: string,
  name: string,
): Promise<void> {
  const response = await request.post('/api/auth/dev-login', {
    headers: CLIENT_HEADERS,
    data: { email, name },
  })
  expect(response.status()).toBe(200)
}

/** Every activity the signed-in user has on the server, read page by page. */
export async function apiActivities(request: APIRequestContext): Promise<ActivityRecord[]> {
  const records: ActivityRecord[] = []
  let cursor: string | null = null
  for (let pages = 0; pages < 100; pages++) {
    const query = cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`
    const response = await request.get(`/api/activities${query}`)
    expect(response.status()).toBe(200)
    const page = (await response.json()) as ActivityPage
    records.push(...page.items)
    cursor = page.nextCursor
    if (cursor === null) return records
  }
  throw new Error('the activity list did not end after 100 pages')
}
