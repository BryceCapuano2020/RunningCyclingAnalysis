import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { Me } from '@rca/contract'
import {
  CLIENT_HEADERS,
  LANDING_TITLE,
  activitiesRows,
  apiActivities,
  signInAs,
  uniqueEmail,
  uploadFixtures,
} from './helpers.js'

const NAME = 'Ada Lovelace'
const FIRST_NAME = 'Ada'
const RUNNING_HEADLINE = /Your running is .* stronger/
const SAVED_NOTICE = 'Saved 14 activities to your library'
const KEEP_FILES = 'Keep original files in my library'
/** An import saves each activity and its file in turn, which takes longer than the default. */
const IMPORT = { timeout: 30_000 }

function headline(page: Page) {
  return page.getByRole('heading', { level: 1 })
}

function accountButton(page: Page) {
  return page.getByRole('button', { name: FIRST_NAME, exact: true })
}

function headerSignIn(page: Page) {
  return page.getByRole('banner').getByRole('button', { name: 'Sign in with Google' })
}

async function profileMassKg(page: Page): Promise<number> {
  const response = await page.request.get('/api/me')
  expect(response.status()).toBe(200)
  const me = (await response.json()) as Me
  return me.profile.massKg
}

async function storedFileCount(page: Page): Promise<number> {
  return (await apiActivities(page.request)).filter((record) => record.hasFile).length
}

/**
 * Signs in on a fresh page, waits for the account to load, then imports the export. The app drops
 * a file chosen while the library is still loading, so the upload is retried until results appear.
 */
async function signedInWithExport(page: Page, email: string): Promise<void> {
  await signInAs(page.request, email, NAME)
  await page.goto('/')
  await expect(accountButton(page)).toBeVisible()
  await expect(async () => {
    await uploadFixtures(page, ['sample-export.zip'])
    await expect(headline(page)).toHaveText(RUNNING_HEADLINE, { timeout: 10_000 })
  }).toPass(IMPORT)
}

test('the account menu shows the first name once signed in', async ({ page }) => {
  await signInAs(page.request, uniqueEmail(), NAME)
  await page.goto('/')

  await expect(accountButton(page)).toBeVisible()
  await expect(headerSignIn(page)).toHaveCount(0)
})

test('a saved library survives reloads and sign-out, and deleting the account removes it', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const email = uniqueEmail()

  await test.step('importing the export saves its activities and their files', async () => {
    await signedInWithExport(page, email)
    await expect(activitiesRows(page)).toHaveCount(14)
    // Results appear once every activity and file is stored, so the server should agree.
    await expect.poll(() => storedFileCount(page), IMPORT).toBe(14)
  })

  await test.step('a reload shows the results the server returns', async () => {
    await page.reload()
    await expect(headline(page)).toHaveText(RUNNING_HEADLINE, IMPORT)
    await expect(activitiesRows(page)).toHaveCount(14)
  })

  await test.step('a body weight change is saved to the profile', async () => {
    const body = page.getByLabel('Body weight')
    await body.fill('185')
    await body.blur()
    await expect(body).toHaveValue(/^185(\.0)?$/)

    // The form is in imperial by default, so 185 lb is about 83.9 kg in the profile.
    await expect.poll(() => profileMassKg(page)).toBeCloseTo(83.91, 1)

    await page.reload()
    await expect(headline(page)).toHaveText(RUNNING_HEADLINE, IMPORT)
    await expect(page.getByLabel('Body weight')).toHaveValue(/^185(\.0)?$/)
  })

  await test.step('turning off keep original files deletes the stored files', async () => {
    const keep = page.getByRole('checkbox', { name: KEEP_FILES })
    await expect(keep).toBeChecked()
    // The checkbox follows the saved profile, so it changes once the PUT has returned.
    await keep.click()
    await expect(keep).not.toBeChecked()

    await expect.poll(() => storedFileCount(page)).toBe(0)
    expect(await apiActivities(page.request)).toHaveLength(14)
  })

  await test.step('signing out returns to the landing page with the sign-in button', async () => {
    await accountButton(page).click()
    await page.getByRole('button', { name: 'Sign out' }).click()

    await expect(headline(page)).toHaveText(LANDING_TITLE)
    await expect(headerSignIn(page)).toBeVisible()
    expect((await page.request.get('/api/me')).status()).toBe(401)
  })

  await test.step('signing back in with the same email brings the library back', async () => {
    await signInAs(page.request, email, NAME)
    await page.reload()
    await expect(headline(page)).toHaveText(RUNNING_HEADLINE, IMPORT)
    await expect(activitiesRows(page)).toHaveCount(14)
    await expect(page.getByRole('checkbox', { name: KEEP_FILES })).not.toBeChecked()
    await expect(page.getByLabel('Body weight')).toHaveValue(/^185(\.0)?$/)
  })

  await test.step('deleting the account from the menu removes it and its data', async () => {
    await accountButton(page).click()
    await page.getByRole('button', { name: 'Delete account…' }).click()

    const dialog = page.getByRole('dialog', { name: 'Delete your account?' })
    await dialog.getByLabel('Email address').fill(email)
    await dialog.getByRole('button', { name: 'Delete account', exact: true }).click()

    await expect(headline(page)).toHaveText(LANDING_TITLE)
    await expect(headerSignIn(page)).toBeVisible()
    expect((await page.request.get('/api/me')).status()).toBe(401)
  })
})

test('a second user cannot see, fetch or delete the first user activities', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000)
  await signedInWithExport(page, uniqueEmail())
  await expect.poll(() => storedFileCount(page), IMPORT).toBe(14)

  const [first] = await apiActivities(page.request)
  if (first === undefined) throw new Error('the export saved no activities')

  // `request` is a separate API context with its own cookie jar, so it acts as a second user.
  await signInAs(request, uniqueEmail(), 'Grace Hopper')
  expect(await apiActivities(request)).toEqual([])
  expect((await request.get(`/api/activities/${first.id}/file`)).status()).toBe(404)
  const deleted = await request.delete(`/api/activities/${first.id}`, { headers: CLIENT_HEADERS })
  expect(deleted.status()).toBe(404)

  expect(await apiActivities(page.request)).toHaveLength(14)
})

test('a file chosen while the library loads is not silently dropped', async ({ page }) => {
  test.setTimeout(120_000)
  // Hold the library request so the app is still busy when the file is chosen.
  await page.route('**/api/activities', async (route) => {
    if (route.request().method() === 'GET') await new Promise((done) => setTimeout(done, 4000))
    await route.continue()
  })
  await signInAs(page.request, uniqueEmail(), NAME)
  await page.goto('/')
  await expect(accountButton(page)).toBeVisible()

  await uploadFixtures(page, ['sample-export.zip'])
  await expect(headline(page)).toHaveText(RUNNING_HEADLINE, { timeout: 20_000 })
})

test('an import started on the landing page shows the saved notice', async ({ page }) => {
  test.setTimeout(120_000)
  await signedInWithExport(page, uniqueEmail())
  await expect(page.getByText(SAVED_NOTICE)).toBeVisible({ timeout: 5_000 })
})
