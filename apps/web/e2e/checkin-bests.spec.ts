import { expect, test } from '@playwright/test'
import { seedBaseline } from './checkinSeed.js'
import { BALANCE_TITLE, uploadFixtures } from './helpers.js'

/**
 * "Since your last import" and the import summary tell one story about bests. A second, faster run in a small library
 * is not a best either of them can name against so little history, and neither names it.
 */

/** A synthetic 40-minute run at a steady speed, later than the fixture run, as a TCX file. */
function fastRun(): { name: string; mimeType: string; buffer: Buffer } {
  const start = Date.UTC(2025, 6, 20, 7, 0, 0)
  const speed = 3.8
  const points = Array.from({ length: 2401 }, (_, s) => {
    const time = new Date(start + s * 1000).toISOString()
    const lat = 51.5 + (s * speed) / 111_320
    return `<Trackpoint><Time>${time}</Time><Position><LatitudeDegrees>${lat}</LatitudeDegrees><LongitudeDegrees>-0.12</LongitudeDegrees></Position><AltitudeMeters>200</AltitudeMeters><DistanceMeters>${s * speed}</DistanceMeters><HeartRateBpm><Value>150</Value></HeartRateBpm></Trackpoint>`
  })
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Id>${new Date(start).toISOString()}</Id><Lap StartTime="${new Date(start).toISOString()}"><TotalTimeSeconds>2400</TotalTimeSeconds><DistanceMeters>${2400 * speed}</DistanceMeters><Intensity>Active</Intensity><TriggerMethod>Manual</TriggerMethod><Track>${points.join('')}</Track></Lap></Activity></Activities></TrainingCenterDatabase>`
  return { name: 'faster-run.tcx', mimeType: 'application/xml', buffer: Buffer.from(xml) }
}

test('a faster second run is not called a new best by the summary while the row says there is none', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await uploadFixtures(page, ['one-run.tcx'])
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await seedBaseline(page)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)

  await page.locator('input[type="file"]').first().setInputFiles(fastRun())
  await expect(page.getByText(/Added 1 run/).first()).toBeVisible({ timeout: 30_000 })

  const row = page.locator('[data-testid="checkin-row"]')
  await expect(row).toContainText('Nothing moved: no new bests')
  // The summary above names no best the row denies.
  await expect(page.locator('.app__notices').getByText(/New best/)).toHaveCount(0)
})
