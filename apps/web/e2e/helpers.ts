/// <reference lib="dom" />
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import type { APIRequestContext, Locator, Page } from '@playwright/test'
import type { ActivityPage, ActivityRecord, Me } from '@rca/contract'
import { lbToKg } from '@rca/core/units'

/** Hard-coded text from the landing page; the test suite checks it, so change both together. */
export const LANDING_TITLE = 'Are you a better runner or a better cyclist?'

/** The sample banner, the line that says once that the sample is not kept. Two lines on a 320 px phone. */
export const SAMPLE_BANNER =
  /^Sample athlete, a 37-year-old man at 75 kg\. Not kept: add files to replace it\.$/

/**
 * The Balance page's h1: the answer, what is missing before the two sports can be compared, or the
 * balance held until a weight is entered.
 */
export const BALANCE_TITLE =
  /leans toward|in balance|see your balance|Not enough to compare yet|waits for your weight/

/** The axe tags checked: WCAG 2.0, 2.1 and 2.2 A and AA, and axe's best practices. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

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

/** The rows of the activity list's first page (PAGE_SIZE in src/ui/components/usePagination.ts). */
export const LIST_PAGE_SIZE = 20

/** The rows of the Activities list. Opens the Activities page first, so callers need no setup. */
export async function activitiesRows(page: Page): Promise<Locator> {
  await goTo(page, 'Activities')
  return page.locator('.activity-list__items > li')
}

/**
 * Waits for the app to show the library it kept in this browser, which has `count` activities. Call it
 * after `page.goto` and before adding files: files chosen while the app is still deciding whether
 * anyone is signed in and loading that library can be lost, which showed as a row missing from the list.
 */
export async function libraryLoaded(page: Page, count: number): Promise<void> {
  await expect(await activitiesRows(page)).toHaveCount(count, { timeout: 30_000 })
}

/**
 * Waits for an import to end, which is when the app shows its summary. The summary appears after the
 * worker has saved the library and the recordings, so a test that leaves the page next does not cut
 * those writes short. A row in the Activities list is no such signal: it shows before the saves end.
 */
export async function importSummaryShown(page: Page, sentence: RegExp, timeoutMs = 30_000) {
  await expect(page.locator('.import-notice').getByText(sentence)).toBeVisible({
    timeout: timeoutMs,
  })
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
  // Test only: the pointer is left where the button was, and a mouse resting on a term defined in place opens its
  // note, which would cover what the test clicks next. A phone has no resting pointer (Definition ignores touch).
  await page.mouse.move(0, 0)
}

/** The setup dialog's name. It has one heading for every visitor. */
export const SETUP_DIALOG_NAME = /^A few details$/

/**
 * How long an upload waits for the setup dialog. Most uploads do not open it, so the wait is kept
 * short. The dialog opens at once on the first import, even while the account is still loading.
 */
const SETUP_DIALOG_WAIT_MS = 2_000

/**
 * The body weight the e2e suite answers the setup dialog with, in pounds: 185 lb, about 83.9 kg. The
 * suite writes weights in pounds; the dialog may show kilograms, as a signed-in account does.
 */
export const DEFAULT_WEIGHT_TEXT = '185'

/** A weight in pounds, entered in the units the setup dialog shows: pounds as given, or kilograms. */
function weightInShownUnits(pounds: string, metric: boolean): string {
  return metric ? lbToKg(Number(pounds)).toFixed(1) : pounds
}

/**
 * The first import on a device opens the setup dialog once, and holds the files until it is
 * answered. When the dialog appears, this enters the body weight, in pounds, and answers it, so the
 * import goes on. When it does not appear within the wait, the setup was answered already and there
 * is nothing to do.
 */
export async function completeSetup(
  page: Page,
  waitMs: number = SETUP_DIALOG_WAIT_MS,
  pounds: string = DEFAULT_WEIGHT_TEXT,
): Promise<void> {
  const dialog = page.getByRole('dialog', { name: SETUP_DIALOG_NAME })
  try {
    await dialog.waitFor({ state: 'visible', timeout: waitMs })
  } catch {
    return
  }
  // Typing freezes the units the dialog shows: until then an account that answers late can switch them, and
  // the digits would be read in the other unit. So type something first, then read the units, then type the weight.
  const field = dialog.getByLabel('Body weight')
  await field.fill('1')
  const metric = await dialog.getByRole('radio', { name: 'Metric' }).isChecked()
  await field.fill(weightInShownUnits(pounds, metric))
  await dialog.getByRole('button', { name: 'Analyse my files' }).click()
  await expect(dialog).toBeHidden()
}

/**
 * Waits for the app to finish what it starts with: the sign-in lookup, then the signed-in library. Until then
 * files are not imported as they will be: a file chosen while the lookup runs is analysed for this session
 * only (a duplicate restores nothing), and the page that held the file input while the library loaded is
 * replaced, so a file sent to its input is lost. That showed as a flaky import that did nothing.
 */
export async function appSettled(page: Page): Promise<void> {
  // The app has rendered, so the two waits below cannot pass before there is anything to wait for.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Checking sign-in…')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Restoring your results' })).toBeHidden()
}

/** What `uploadFixtures` waits for before it sends the files. */
export interface UploadOptions {
  /** False sends the files without waiting for the app to settle, for a test of an import made meanwhile. */
  settled?: boolean
}

/**
 * Sends files to the hidden file input once the app has settled (see appSettled), then answers the setup
 * dialog if the first import asks, with the body weight given in pounds (185 lb by default).
 */
export async function uploadFixtures(
  page: Page,
  names: string[],
  pounds: string = DEFAULT_WEIGHT_TEXT,
  { settled = true }: UploadOptions = {},
): Promise<void> {
  if (settled) await appSettled(page)
  await page.locator('input[type="file"]').first().setInputFiles(names.map(fixturePath))
  await completeSetup(page, SETUP_DIALOG_WAIT_MS, pounds)
}

export async function horizontalOverflow(
  page: Page,
): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
}

/** The top and bottom edges of an element's box. Throws when it has no box, so a missing element fails. */
export async function edgesOf(locator: Locator): Promise<{ top: number; bottom: number }> {
  const box = await locator.boundingBox()
  if (box === null) throw new Error(`no box for ${locator}`)
  return { top: box.y, bottom: box.y + box.height }
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
