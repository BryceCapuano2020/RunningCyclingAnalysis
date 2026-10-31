import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  appSettled,
  BALANCE_TITLE,
  completeSetup,
  edgesOf,
  goTo,
  horizontalOverflow,
  trackErrors,
} from './helpers.js'

/**
 * "Your years" (D9): the row under the fitness card on Balance and the section on the Run page. The first-screen
 * contracts of analysis.spec.ts run on the sample, which has too few weeks for a row; this runs them with one. The library
 * is generated here (70 steady runs nine days apart, a slower stretch in the middle), so it is a slip that came back.
 */

const ROW = '[data-testid="years-row"]'

/** A run of 25 minutes at `speed` m/s and about `hr` bpm, a point every 5 s: steady, and small. */
function gpx(startMs: number, speed: number, hr: number): string {
  const points: string[] = []
  for (let t = 0; t <= 1500; t += 5) {
    const lat = 51 + (speed * t) / 111_320
    const beats = Math.round(hr * (1 + 0.01 * Math.sin(t / 37)))
    points.push(
      `<trkpt lat="${lat.toFixed(6)}" lon="-0.100000"><ele>50</ele><time>${new Date(startMs + t * 1000).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${beats}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`,
    )
  }
  return `<?xml version="1.0"?><gpx version="1.1" creator="e2e" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><type>running</type><trkseg>${points.join('')}</trkseg></trk></gpx>`
}

/** Seventy runs from January 2023, nine days apart; those 28 to 45 are 10% slower. */
function library() {
  const start = Date.UTC(2023, 0, 2, 7)
  return Array.from({ length: 70 }, (_, i) => ({
    name: `run-${String(i).padStart(2, '0')}.gpx`,
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(gpx(start + i * 9 * 86_400_000, i >= 28 && i < 46 ? 3.06 : 3.4, 150)),
  }))
}

/** A kept library with years to tell, loaded fresh. */
async function openWithYears(page: Page): Promise<void> {
  await page.goto('/')
  await appSettled(page)
  await page.locator('input[type="file"]').first().setInputFiles(library())
  await completeSetup(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE, {
    timeout: 60_000,
  })
  await page.reload()
  await expect(page.locator(ROW)).toBeVisible({ timeout: 30_000 })
}

/** The top of the section tabs at a phone width, where they are fixed to the foot of the window. */
async function tabBarTop(page: Page): Promise<number> {
  const tabs = page.locator('.header__tabs')
  expect(await tabs.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
  return (await edgesOf(tabs)).top
}

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
] as const

for (const size of SIZES) {
  test(`at ${size.width} by ${size.height} the row is 48 px or less, the headline is under it and above the tabs, and nothing overflows`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errors = trackErrors(page)
    await page.setViewportSize(size)
    await openWithYears(page)
    const row = page.locator(ROW)
    const box = (await row.boundingBox())!
    expect(box.height).toBeLessThanOrEqual(48)
    const rowEdges = await edgesOf(row)
    const headline = await edgesOf(page.getByRole('heading', { level: 1 }))
    expect(headline.top).toBeGreaterThanOrEqual(rowEdges.bottom)
    if (size.width < 768) expect(headline.top).toBeLessThan(await tabBarTop(page))
    else expect(headline.top).toBeLessThan(size.height)
    const overflow = await horizontalOverflow(page)
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(size.width)
    expect(errors).toEqual([])
  })

  test(`at ${size.width} by ${size.height} the Run page's years section opens to a chart, its table and the episodes, within the window`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errors = trackErrors(page)
    await page.setViewportSize(size)
    await openWithYears(page)
    await goTo(page, 'Run')
    const section = page.getByRole('region', { name: 'Your years' })
    await expect(section).toBeVisible()
    // Closed, it says what it found.
    await expect(section.locator('summary')).toContainText(/slipped in 2023 and came back/)
    await section.locator('summary').click()
    await expect(section.getByRole('figure', { name: /over the years$/ })).toBeVisible()
    await expect(section.getByRole('region', { name: 'Episodes' })).toContainText(/Slipped about/)
    // The table twin holds a row for each plateau.
    await expect(section.locator('tbody tr').first()).toBeAttached()
    const overflow = await horizontalOverflow(page)
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)
    expect(errors).toEqual([])
  })
}

test('opening the row shows the whole sentence, and Hide takes the row away for good', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await openWithYears(page)
  const row = page.locator(ROW)
  await row.locator('summary').click()
  await expect(row.locator('.checkin-row__full')).toBeVisible()
  await row.getByRole('button', { name: 'Hide' }).click()
  await expect(row).toHaveCount(0)
  // Opened and hidden is seen: a reload brings no row back, and the section is still on the Run page.
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect(page.locator(ROW)).toHaveCount(0)
  await goTo(page, 'Run')
  await expect(page.getByRole('region', { name: 'Your years' })).toBeVisible()
})
