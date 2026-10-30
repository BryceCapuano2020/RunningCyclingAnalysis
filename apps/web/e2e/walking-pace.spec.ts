import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { activitiesRows, completeSetup, horizontalOverflow } from './helpers.js'

// A phone-app runner whose pace is slower than the walking-pace rule: the run is left out, the app says so
// rather than that there are no runs, and counting it is a choice that survives a reload.

/** A GPX run of 40 minutes at about 17 min/mi (1.58 m/s) with no cadence, which the rule treats as a walk. */
function slowRun(): Buffer {
  const start = Date.UTC(2025, 5, 14, 6, 30)
  const metresPerDegree = 111_320
  const points: string[] = []
  for (let second = 0; second <= 40 * 60; second++) {
    const lat = 51 + (second * 1.58) / metresPerDegree
    const time = new Date(start + second * 1000).toISOString()
    points.push(
      `<trkpt lat="${lat.toFixed(9)}" lon="-0.100000000"><ele>50</ele><time>${time}</time></trkpt>`,
    )
  }
  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1"><trk><type>running</type><trkseg>${points.join('')}</trkseg></trk></gpx>`,
  )
}

async function importSlowRun(page: Page) {
  await page.goto('/')
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({ name: 'slow-loop.gpx', mimeType: 'application/gpx+xml', buffer: slowRun() })
  await completeSetup(page)
}

/** The counted run's own page, reached from the list. */
async function openRunPage(page: Page) {
  const rows = await activitiesRows(page)
  await expect(rows).toHaveCount(1)
  await rows.first().getByRole('link').first().click()
}

/** Axe finds nothing and the page does not scroll sideways. */
async function expectCleanAndFitting(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  const { scrollWidth, innerWidth } = await horizontalOverflow(page)
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth)
}

test('a run at walking pace is said to be left out, never that there are no runs, and can be counted', async ({
  page,
}) => {
  await importSlowRun(page)

  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toHaveText('Your run is at walking pace')
  await expect(
    page.getByText('1 run is at walking pace, so it is left out. Count it as a run to include it.'),
  ).toBeVisible()
  await expect(page.getByText(/no running or cycling activities/)).toHaveCount(0)

  await page.getByRole('button', { name: 'Count this run' }).click()
  // The run is in the analysis: the page asks for a ride to compare it with, and says so to a screen reader.
  await expect(heading).toHaveText('Add a ride to see your balance')
  await expect(heading).toBeFocused()
  await expect(page.locator('.app__live .sr-only')).toHaveText('Counting 1 run.')

  // The choice is kept: after a reload the run is still counted, and its page can go back.
  await page.reload()
  await expect(heading).toHaveText('Add a ride to see your balance')
  await openRunPage(page)
  await expect(page.getByText(/You count it as a run/)).toBeVisible()
  await page.getByRole('button', { name: 'Leave this run out' }).click()
  await expect(page.getByRole('button', { name: 'Count this run' })).toBeFocused()
  await expect(page.getByText(/left out of your run analysis/)).toBeVisible()
})

test('every state of the choice is axe-clean and does not scroll sideways at 320 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await importSlowRun(page)

  // Left out, on Balance.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your run is at walking pace')
  await expectCleanAndFitting(page)

  // Left out, on the run's own page; then counted, with focus on the way back; then left out again.
  await openRunPage(page)
  await expect(page.getByRole('button', { name: 'Count this run' })).toBeVisible()
  await expectCleanAndFitting(page)
  await page.getByRole('button', { name: 'Count this run' }).click()
  await expect(page.getByRole('button', { name: 'Leave this run out' })).toBeFocused()
  await expectCleanAndFitting(page)
  await page.getByRole('button', { name: 'Leave this run out' }).click()
  await expect(page.getByRole('button', { name: 'Count this run' })).toBeFocused()
  await expectCleanAndFitting(page)

  // The Run page, when counted, with its line to leave every counted run out.
  await page.getByRole('button', { name: 'Count this run' }).click()
  await page.goto('/#/run')
  await expect(page.getByRole('button', { name: 'Leave it out' })).toBeVisible()
  await expectCleanAndFitting(page)
})
