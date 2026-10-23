import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import type { Me } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { parseFit } from '@rca/core/fit'
import {
  CLIENT_HEADERS,
  LANDING_TITLE,
  activitiesRows,
  apiActivities,
  enableFileRetention,
  fixturePath,
  signInAs,
  uniqueEmail,
  uploadFixtures,
} from './helpers.js'

const NAME = 'Ada Lovelace'
const FIRST_NAME = 'Ada'
const RUNNING_HEADLINE =
  /Over .* your running is estimated to use .* more energy rate per kg than your cycling/
const SAVED_NOTICE = 'Saved 15 activities to your library'
const KEEP_FILES = 'Keep original files in my library'
/** An import saves each activity and its file in turn, which takes longer than the default. */
const IMPORT = { timeout: 30_000 }

/**
 * A saved activity's delete button is labelled with its name, sport and date. Matches on the name
 * at the start, so the sport and date may change without breaking the selector.
 */
function deleteButton(library: Locator, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return library.getByRole('button', { name: new RegExp(`^Delete ${escaped}, `) })
}

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

async function profileKeepsFiles(page: Page): Promise<boolean> {
  const response = await page.request.get('/api/me')
  expect(response.status()).toBe(200)
  const me = (await response.json()) as Me
  return me.profile.keepFiles
}

async function storedFileCount(page: Page): Promise<number> {
  return (await apiActivities(page.request)).filter((record) => record.hasFile).length
}

/** Imports once: retrying the upload would hide a file lost during library hydration. */
async function signedInWithExport(page: Page, email: string): Promise<void> {
  await signInAs(page.request, email, NAME)
  await enableFileRetention(page.request)
  await page.goto('/')
  await expect(accountButton(page)).toBeVisible()
  await uploadFixtures(page, ['sample-export.zip'])
  await expect(headline(page)).toHaveText(RUNNING_HEADLINE, IMPORT)
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
    await expect(activitiesRows(page)).toHaveCount(15)
    // Results appear once every activity and file is stored, so the server should agree.
    await expect.poll(() => storedFileCount(page), IMPORT).toBe(15)
  })

  await test.step('a reload shows the results the server returns', async () => {
    await page.reload()
    await expect(headline(page)).toHaveText(RUNNING_HEADLINE, IMPORT)
    await expect(activitiesRows(page)).toHaveCount(15)
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
    expect(await apiActivities(page.request)).toHaveLength(15)
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
    await expect(activitiesRows(page)).toHaveCount(15)
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
  await expect.poll(() => storedFileCount(page), IMPORT).toBe(15)

  const [first] = await apiActivities(page.request)
  if (first === undefined) throw new Error('the export saved no activities')

  // `request` is a separate API context with its own cookie jar, so it acts as a second user.
  await signInAs(request, uniqueEmail(), 'Grace Hopper')
  expect(await apiActivities(request)).toEqual([])
  expect((await request.get(`/api/activities/${first.id}/file`)).status()).toBe(404)
  const deleted = await request.delete(`/api/activities/${first.id}`, { headers: CLIENT_HEADERS })
  expect(deleted.status()).toBe(404)

  expect(await apiActivities(page.request)).toHaveLength(15)
})

test('a file chosen before account lookup completes is imported and saved once', async ({
  page,
}) => {
  test.setTimeout(120_000)
  let releaseLookup!: () => void
  let lookupStarted!: () => void
  const lookupGate = new Promise<void>((resolve) => {
    releaseLookup = resolve
  })
  const lookupRequest = new Promise<void>((resolve) => {
    lookupStarted = resolve
  })
  await signInAs(page.request, uniqueEmail(), NAME)
  await enableFileRetention(page.request)
  await page.route('**/api/me', async (route) => {
    lookupStarted()
    await lookupGate
    await route.continue()
  })
  await page.goto('/')
  await lookupRequest
  try {
    await uploadFixtures(page, ['sample-export.zip'])
    await expect(accountButton(page)).toHaveCount(0)
  } finally {
    releaseLookup()
  }
  await expect(accountButton(page)).toBeVisible()
  await expect(headline(page)).toHaveText(RUNNING_HEADLINE, IMPORT)
  await expect.poll(() => storedFileCount(page), IMPORT).toBe(15)
})

test('an import started on the landing page shows the saved notice', async ({ page }) => {
  test.setTimeout(120_000)
  await signedInWithExport(page, uniqueEmail())
  await expect(page.getByText(SAVED_NOTICE)).toBeVisible({ timeout: 5_000 })
})

test('new accounts save summaries without retaining original files by default', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await signInAs(page.request, uniqueEmail(), NAME)
  await page.goto('/')
  await expect(accountButton(page)).toBeVisible()
  await uploadFixtures(page, ['one-run.fit'])

  await expect(activitiesRows(page)).toHaveCount(1)
  const me = (await (await page.request.get('/api/me')).json()) as Me
  expect(me.profile.keepFiles).toBe(false)
  expect((await apiActivities(page.request)).map((record) => record.hasFile)).toEqual([false])
  const keep = page.getByRole('checkbox', { name: KEEP_FILES })
  await expect(keep).not.toBeChecked()

  const [summaryOnly] = await apiActivities(page.request)
  if (summaryOnly === undefined) throw new Error('the import saved no activities')

  await keep.click()
  await expect(keep).toBeChecked()
  await expect.poll(() => profileKeepsFiles(page)).toBe(true)
  await uploadFixtures(page, ['one-run.fit'])

  await expect(activitiesRows(page)).toHaveCount(1)
  await expect.poll(() => storedFileCount(page), IMPORT).toBe(1)
  const retained = await apiActivities(page.request)
  expect(retained).toHaveLength(1)
  expect(retained[0]).toMatchObject({ id: summaryOnly.id, hasFile: true })

  await page.reload()
  await expect(activitiesRows(page)).toHaveCount(1)
  await expect(page.getByRole('checkbox', { name: KEEP_FILES })).toBeChecked()
  const afterReload = await apiActivities(page.request)
  expect(afterReload).toHaveLength(1)
  expect(afterReload[0]).toMatchObject({ id: summaryOnly.id, hasFile: true })
})

test('rebuilds a legacy saved activity from its original file without changing its library identity', async ({
  page,
}) => {
  const email = uniqueEmail()
  await signInAs(page.request, email, NAME)
  await enableFileRetention(page.request)

  const bytes = await readFile(fixturePath('one-run.fit'))
  const parsed = parseFit(new Uint8Array(bytes), 'one-run.fit')
  if (!parsed.ok) throw new Error(`Could not parse rebuild fixture: ${parsed.reason}`)
  const activity = parsed.activities[0]
  if (!activity) throw new Error('Rebuild fixture contains no activities')
  const digest = { ...digestActivity(activity), modelRevision: 1 }
  const fileHash = createHash('sha256').update(bytes).digest('hex')
  const created = await page.request.post('/api/activities', {
    headers: CLIENT_HEADERS,
    data: { digest, fileName: 'one-run.fit', fileHash },
  })
  expect(created.status()).toBe(201)
  const legacyRecord = await created.json()
  const upload = await page.request.put(`/api/activities/${legacyRecord.id}/file`, {
    headers: { ...CLIENT_HEADERS, 'Content-Type': 'application/octet-stream' },
    data: bytes,
  })
  expect(upload.status()).toBe(200)
  expect(await upload.json()).toMatchObject({ id: legacyRecord.id, hasFile: true })

  await page.goto('/')
  const savedActivityNotice = page
    .getByRole('region', { name: 'Saved activity updates' })
    .getByRole('status')
  await expect(savedActivityNotice).toContainText('1 saved activity uses an older analysis model')
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  await page.getByRole('button', { name: 'Rebuild saved activities' }).click()

  await expect(savedActivityNotice).toBeHidden()
  await expect(activitiesRows(page)).toHaveCount(1)
  const records = await apiActivities(page.request)
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ id: legacyRecord.id, hasFile: true })
  expect(records[0]?.digest.modelRevision).toBe(MODEL_REVISION)
})

test('saved activity deletion requires confirmation and persists after reload', async ({
  page,
}) => {
  await signInAs(page.request, uniqueEmail(), NAME)
  await enableFileRetention(page.request)
  await page.goto('/')
  await expect(accountButton(page)).toBeVisible()
  await uploadFixtures(page, ['one-run.fit'])
  await expect.poll(() => storedFileCount(page), IMPORT).toBe(1)
  const [record] = await apiActivities(page.request)
  if (!record) throw new Error('saved activity missing')
  const library = page.getByRole('region', { name: 'Saved library', exact: true })
  await deleteButton(library, record.digest.name).click()
  await library.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(await apiActivities(page.request)).toHaveLength(1)
  await deleteButton(library, record.digest.name).click()
  await library.getByRole('button', { name: 'Delete permanently', exact: true }).click()
  await expect.poll(async () => (await apiActivities(page.request)).length, IMPORT).toBe(0)
  await expect(library.getByRole('status')).toContainText(`Deleted ${record.digest.name}`)
  await page.reload()
  await expect(accountButton(page)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(LANDING_TITLE)
  expect((await page.request.get(`/api/activities/${record.id}/file`)).status()).toBe(404)
})

test('the footer privacy link points to the canonical /privacy page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Privacy', exact: true })).toHaveAttribute(
    'href',
    '/privacy',
  )
})
