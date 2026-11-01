import { expect, test } from '@playwright/test'
import { boxCensus } from './boxCensus'
import { goTo, openSample } from './helpers'

/**
 * The box ratchet (D10, fewer boxes). Run and Ride put 71% of their height in bordered, shadowed cards; the
 * sections, the answer and the fitness card are bands now, an open disclosure with them, and what keeps a box is a
 * folded disclosure row. The
 * caps are the measured values (6% and 11% at most, normal and forced colours) plus about 2 points, so they may only be lowered: a new card on a sport page fails here.
 */
const CAP = { desktop: 0.08, phone: 0.12 } as const
const SIZES = [
  { name: 'desktop', width: 1440, height: 900, cap: CAP.desktop },
  { name: 'phone', width: 390, height: 844, cap: CAP.phone },
] as const

for (const size of SIZES) {
  for (const sport of ['Run', 'Ride'] as const) {
    for (const forced of [false, true]) {
      test(`${sport} keeps few boxes at ${size.width} px${forced ? ' in forced colours' : ''}`, async ({
        page,
      }, testInfo) => {
        test.skip(testInfo.project.name !== 'desktop', 'Sets its own viewport')
        if (forced) await page.emulateMedia({ forcedColors: 'active' })
        await page.setViewportSize({ width: size.width, height: size.height })
        await openSample(page)
        await goTo(page, sport)
        await expect(page.locator('.fitness-card')).toBeVisible()
        await page.evaluate(() => document.fonts.ready)
        const census = await boxCensus(page)
        // Sections are open to start with, and an open one is a band: only a box that is a disclosure card may remain.
        expect(census.boxes.filter((box) => !box.startsWith('section.panel'))).toEqual([])
        expect(census.share).toBeLessThanOrEqual(size.cap)
        // A folded disclosure is a card of one row, so the census is not blind to it.
        await page.locator('.sport-disclosure__summary').first().click()
        await expect(page.locator('section.panel.sport-disclosure')).toHaveCount(1)
        const folded = await boxCensus(page)
        expect(folded.boxes.some((box) => box.startsWith('section.panel'))).toBe(true)
        expect(folded.share).toBeLessThanOrEqual(size.cap)
      })
    }
  }
}
