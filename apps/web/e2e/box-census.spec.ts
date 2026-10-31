import { expect, test } from '@playwright/test'
import { boxCensus } from './boxCensus'
import { goTo, openSample } from './helpers'

/**
 * The box ratchet (D10, fewer boxes). Run and Ride put 71% of their height in bordered, shadowed cards; the
 * sections, the answer and the fitness card are bands now, and what keeps a box is a closed disclosure row. The
 * caps sit just above what the pages measure, so they may only be lowered: a new card on a sport page fails here.
 */
const CAP = { desktop: 0.08, phone: 0.12 } as const
const SIZES = [
  { name: 'desktop', width: 1440, height: 900, cap: CAP.desktop },
  { name: 'phone', width: 390, height: 844, cap: CAP.phone },
] as const

for (const size of SIZES) {
  for (const sport of ['Run', 'Ride'] as const) {
    test(`${sport} keeps few boxes at ${size.width} px`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'Sets its own viewport')
      await page.setViewportSize({ width: size.width, height: size.height })
      await openSample(page)
      await goTo(page, sport)
      await expect(page.locator('.fitness-card')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const census = await boxCensus(page)
      // The disclosure rows are the boxes that remain, and there are some, so the census is not blind.
      expect(census.boxes.length).toBeGreaterThan(0)
      expect(census.boxes.filter((box) => !box.startsWith('section.panel'))).toEqual([])
      expect(census.share).toBeLessThanOrEqual(size.cap)
    })
  }
}
