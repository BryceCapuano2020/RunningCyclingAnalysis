import { expect, test } from '@playwright/test'
import { boxCensus } from './boxCensus'
import { goTo, openSample } from './helpers'

/**
 * The box ratchet (D10, fewer boxes). Run and Ride once put 71% of their height in bordered, shadowed cards. On paper
 * (docs/design/system.md, No boxes) every section is a heading and a rule, open or folded, so the census measures none
 * at either size, in normal and forced colours. The caps are those measured values, so they may only stay at zero: a
 * new card on a sport page fails here.
 */
const CAP = { desktop: 0, phone: 0 } as const
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
        // Sections are open to start with, and a section is a band: no box remains on the page.
        expect(census.boxes).toEqual([])
        expect(census.share).toBeLessThanOrEqual(size.cap)
        // The census is not blind: a bordered block put on the page is counted.
        await page.evaluate(() => {
          const card = document.createElement('div')
          card.style.cssText = 'height:60px;width:300px;border:1px solid currentColor'
          card.className = 'census-probe'
          document.querySelector('main')!.append(card)
        })
        const probed = await boxCensus(page)
        expect(probed.boxes).toEqual(['div.census-probe'])
        expect(probed.share).toBeGreaterThan(0)
      })
    }
  }
}
