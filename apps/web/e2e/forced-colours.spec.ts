import { expect, test } from '@playwright/test'
import { textOverlaps } from './a11yProbes.js'
import { activitiesRows, goTo, openSample } from './helpers.js'

test.use({ forcedColors: 'active' })

const ONLY_DESKTOP = 'Forced colours is the same in each browser'

/** The areas where a big figure sits beside a chip, an eyebrow or a unit. */
const HERO_AREAS = '.balance-hero, .sport-hero, .activity-page__top'

test.describe('forced colours', () => {
  for (const destination of ['Balance', 'Run', 'Ride'] as const) {
    test(`${destination}: no text sits over other text in the hero`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', ONLY_DESKTOP)
      await openSample(page)
      await goTo(page, destination)
      await expect(page.locator(HERO_AREAS).first()).toBeVisible()
      expect(await textOverlaps(page, HERO_AREAS)).toEqual([])
    })
  }

  test('an activity: no text sits over other text at the top', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', ONLY_DESKTOP)
    await openSample(page)
    const rows = await activitiesRows(page)
    await rows.first().getByRole('link').click()
    await expect(page.getByRole('slider', { name: 'Selection start' })).toBeVisible()
    expect(await textOverlaps(page, HERO_AREAS)).toEqual([])
  })
})
