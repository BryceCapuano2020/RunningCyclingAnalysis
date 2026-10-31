import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { appSettled, completeSetup, fixturePath } from './helpers.js'

/** One ride as Strava wrote the oldest files: a track with no type. */
async function untypedRide(): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const text = (await readFile(fixturePath('one-ride.gpx'), 'utf8')).replace(
    /<type>[^<]*<\/type>/,
    '',
  )
  return { name: 'one-ride.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(text) }
}

function list(...rows: string[]) {
  const text = ['Activity ID,Activity Name,Activity Type,Filename', ...rows].join('\n') + '\n'
  return { name: 'activities.csv', mimeType: 'text/csv', buffer: Buffer.from(text) }
}

async function send(page: Page, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  await page.goto('/')
  await appSettled(page)
  await page.locator('input[type="file"]').first().setInputFiles(files)
  await completeSetup(page)
}

test('a loose activities.csv gives untyped files their sport', async ({ page }) => {
  await send(page, [
    list('9001,Evening Ride,Ride,activities/one-ride.gpx', '9002,Not here,Run,activities/gone.gpx'),
    await untypedRide(),
  ])

  const notice = page.locator('.import-notice')
  await expect(notice.getByText(/Added 1 ride/)).toBeVisible({ timeout: 30_000 })
  await expect(
    notice.getByText('Your activities.csv lists 2 files; 1 was in this import.'),
  ).toBeVisible()
  await expect(notice.getByText(/need a look/)).toHaveCount(0)
})

test('untyped files with no list are refused, and the import says to add the list', async ({
  page,
}) => {
  await send(page, [await untypedRide()])

  const notice = page.locator('.import-notice')
  await expect(
    notice.getByText('Add activities.csv from the same export to give these their sport.'),
  ).toBeVisible({ timeout: 30_000 })
  await expect(notice.getByText(/Added 1 ride/)).toHaveCount(0)
})
