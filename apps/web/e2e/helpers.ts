/// <reference lib="dom" />
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import type { APIRequestContext, Locator, Page } from '@playwright/test'
import type { ActivityPage, ActivityRecord, Me } from '@rca/contract'

/** Hard-coded text from the landing page; the test suite checks it, so change both together. */
export const LANDING_TITLE = 'How balanced are you as an athlete?'

/**
 * The Balance page's h1: the answer, what is missing before the two sports can be compared, or the
 * balance held until a weight is entered.
 */
export const BALANCE_TITLE =
  /leans toward|in balance|see your balance|balance needs harder efforts|waits for your weight/

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag22aa']

export type Destination = 'Balance' | 'Run' | 'Ride' | 'Activities' | 'Profile'

const HEADINGS: Record<Destination, string | RegExp> = {
  Balance: BALANCE_TITLE,
  Run: 'Run',
  Ride: 'Ride',
  Activities: 'Activities',
  Profile: 'Profile',
}

/** Clicks the header link to a page, then waits for that page's h1. */
export async function goTo(page: Page, destination: Destination): Promise<void> {
  const link =
    destination === 'Profile'
      ? page.getByRole('banner').getByRole('link', { name: 'Profile', exact: true })
      : page
          .getByRole('navigation', { name: 'Sections' })
          .getByRole('link', { name: destination, exact: true })
  await link.click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(HEADINGS[destination])
}

/** The rows of the Activities list. Opens the Activities page first, so callers need no setup. */
export async function activitiesRows(page: Page): Promise<Locator> {
  await goTo(page, 'Activities')
  return page.locator('.activity-list__items > li')
}

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url))

export function fixturePath(name: string): string {
  return join(FIXTURE_DIR, name)
}

/** Collects console errors and uncaught page errors. Attach before navigating. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

/**
 * How long the sample takes to reach Balance. The analysis runs in a worker, and under load it has
 * taken longer than the default 5 s. This is inside the 60 s test timeout in playwright.config.ts.
 */
const SAMPLE_READY_MS = 20_000

export async function openSample(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'See a sample athlete' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE, {
    timeout: SAMPLE_READY_MS,
  })
}

/** The setup dialog's name. It has one heading for every visitor. */
export const SETUP_DIALOG_NAME = /^A few details$/

/**
 * How long an upload waits for the setup dialog. Most uploads do not open it, so the wait is kept
 * short. The dialog opens at once on the first import, even while the account is still loading.
 */
const SETUP_DIALOG_WAIT_MS = 2_000

/**
 * The body weight the e2e suite answers the setup dialog with: 185 lb, the units the suite runs in,
 * which is about 83.9 kg. A weight is entered as a real user would, since the balance waits for one.
 */
export const DEFAULT_WEIGHT_TEXT = '185'

/**
 * The first import on a device opens the setup dialog once, and holds the files until it is
 * answered. When the dialog appears, this enters the body weight and answers it, so the import goes
 * on. When it does not appear within the wait, the setup was answered already and there is nothing
 * to do.
 */
export async function completeSetup(
  page: Page,
  waitMs: number = SETUP_DIALOG_WAIT_MS,
  weight: string = DEFAULT_WEIGHT_TEXT,
): Promise<void> {
  const dialog = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  try {
    await dialog.waitFor({ state: 'visible', timeout: waitMs })
  } catch {
    return
  }
  await dialog.getByLabel('Body weight').fill(weight)
  await dialog.getByRole('button', { name: 'Analyse my files' }).click()
  await expect(dialog).toBeHidden()
}

/**
 * Sends files to the hidden file input, then answers the setup dialog if the first import asks,
 * with the body weight given (185 lb by default).
 */
export async function uploadFixtures(
  page: Page,
  names: string[],
  weight: string = DEFAULT_WEIGHT_TEXT,
): Promise<void> {
  await page.locator('input[type="file"]').first().setInputFiles(names.map(fixturePath))
  await completeSetup(page, SETUP_DIALOG_WAIT_MS, weight)
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

/** Turns on original-file storage for tests that explicitly exercise the R2 path. */
export async function enableFileRetention(request: APIRequestContext): Promise<void> {
  const response = await request.get('/api/me')
  expect(response.status()).toBe(200)
  const me = (await response.json()) as Me
  expect(me.fileRetentionAvailable).not.toBe(false)
  if (me.profile.keepFiles) return
  const updated = await request.put('/api/profile', {
    headers: CLIENT_HEADERS,
    data: {
      massKg: me.profile.massKg,
      bikeMassKg: me.profile.bikeMassKg,
      units: me.profile.units,
      keepFiles: true,
    },
  })
  expect(updated.status()).toBe(200)
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
