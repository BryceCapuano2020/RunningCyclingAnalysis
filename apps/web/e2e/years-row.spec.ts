import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import {
  appSettled,
  BALANCE_TITLE,
  completeSetup,
  edgesOf,
  goTo,
  horizontalOverflow,
  importSummaryShown,
  trackErrors,
  WCAG_TAGS,
} from './helpers.js'

/**
 * History (D9): the row on the Run page that links to the History tab, and the
 * episodes the tab lists under its fitness chart. The sample has too few weeks for a row; this runs them with a library that has one. (The row under the fitness card on Balance was cut on 10 Nov 2026.) The library
 * is generated here (96 steady runs nine days apart, a slower stretch in the middle), so it is a slip that came back.
 */

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

/**
 * Ninety-six runs from January 2023, nine days apart; those 28 to 51 are 10% slower. The years are told as of the newest run,
 * through 12 weeks before it, and a library under two years to that point leads with nothing, so this one runs past two years.
 * The slow stretch is 24 runs, which this length lists as an episode.
 */
function library() {
  const start = Date.UTC(2023, 0, 2, 7)
  return Array.from({ length: 96 }, (_, i) => ({
    name: `run-${String(i).padStart(2, '0')}.gpx`,
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(gpx(start + i * 9 * 86_400_000, i >= 28 && i < 52 ? 3.06 : 3.4, 150)),
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
  // The heading shows before the worker has saved the library; a reload that cuts the save short keeps nothing to tell.
  await importSummaryShown(page, 'Added', /^96 runs$/, 60_000)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE, {
    timeout: 30_000,
  })
}

const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
] as const

for (const size of SIZES) {
  test(`at ${size.width} by ${size.height} the Run page's History row says its finding and links to the History tab, which lists the episodes under its chart`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const errors = trackErrors(page)
    await page.setViewportSize(size)
    await openWithYears(page)
    await goTo(page, 'Run')
    const section = page.getByRole('region', { name: 'History' })
    await expect(section).toBeVisible()
    // A strip of the years with the slip shaded, its finding as the strip's text, and a link. The episodes are the History tab's.
    await expect(section).toContainText(/Slipped in 2023, then came back/)
    await expect(
      section.getByRole('figure', { name: 'History' }).getByTestId('fitness-span').first(),
    ).toBeAttached()
    await expect(section.getByRole('region', { name: 'Episodes' })).toHaveCount(0)
    const link = section.getByRole('link', { name: 'See History' })
    await expect(link).toHaveAttribute('href', '#/history')
    expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([])
    await link.click()
    await expect(page.getByRole('heading', { level: 1, name: 'History' })).toBeVisible()
    const chart = page.getByRole('figure', { name: 'Fitness over the years' })
    await expect(chart.getByTestId('fitness-dots')).toBeAttached()
    await expect(chart.getByTestId('fitness-span').first()).toBeAttached()
    // The episodes are listed under the chart, each with its size.
    const episodes = page.getByRole('region', { name: 'Episodes' })
    // Each episode is label over number: what happened, then its size with its range.
    await expect(episodes).toContainText(/Slipped, then back/)
    await expect(episodes).toContainText(/\d+% \(-?\d+ to -?\d+\)/)
    expect((await edgesOf(episodes)).top).toBeGreaterThanOrEqual((await edgesOf(chart)).bottom)
    expect((await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()).violations).toEqual([])
    const overflow = await horizontalOverflow(page)
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)
    expect(errors).toEqual([])
  })
}
