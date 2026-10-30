import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { activitiesRows, goTo, openSample } from './helpers'
import { TEXT_SPACING_CSS, clippedContent, svgTextOverlaps } from './zoomProbes'

/**
 * WCAG 1.4.4 (text at 200%) and 1.4.12 (text spacing): chart labels stay apart, the page does not scroll
 * sideways, and no box cuts its text off. The table twin of each chart carries every value, so a label
 * the layout drops is still readable there.
 */
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

/** Before the app starts: the charts measure their labels at the larger root size, with age grades on. */
async function zoomText(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // A style rule, not an inline style: the parser can replace the root before the page's own scripts run.
    const add = (): boolean => {
      if (document.documentElement === null) return false
      const rule = document.createElement('style')
      rule.textContent = 'html { font-size: 200% !important; }'
      document.documentElement.appendChild(rule)
      return true
    }
    if (!add())
      new MutationObserver((_, watcher) => add() && watcher.disconnect()).observe(document, {
        childList: true,
      })
    localStorage.setItem(
      'rca.preferences.v1',
      JSON.stringify({
        settings: { massKg: 75, bikeMassKg: 9 },
        units: 'metric',
        birthYear: 1986,
        sex: 'male',
        setupDone: true,
      }),
    )
  })
}

/** Opens every closed section of a sport page, each followed by its content, so the charts behind them are checked. */
async function openSections(page: Page): Promise<void> {
  const closed = page.locator('.sport-disclosure__summary')
  const count = await closed.count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i += 1) {
    await closed.nth(i).click()
    await expect(page.locator('.sport-disclosure__details[open]')).toHaveCount(i + 1)
  }
}

async function spaceText(page: Page): Promise<void> {
  await page.addStyleTag({ content: TEXT_SPACING_CSS })
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  // Two frames: the charts re-measure after the spacing sheet lands.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
}

async function expectIntact(page: Page): Promise<void> {
  await settle(page)
  expect(await svgTextOverlaps(page, 'main')).toEqual([])
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0)
  expect(await clippedContent(page)).toEqual([])
}

const PAGES: { name: string; open: (page: Page) => Promise<void> }[] = [
  { name: 'Balance', open: async () => {} },
  {
    name: 'Run',
    open: async (page) => {
      await goTo(page, 'Run')
      await openSections(page)
    },
  },
  {
    name: 'Ride',
    open: async (page) => {
      await goTo(page, 'Ride')
      await openSections(page)
    },
  },
  {
    name: 'Activities',
    open: async (page) => {
      await goTo(page, 'Activities')
    },
  },
  {
    name: 'Activity',
    open: async (page) => {
      const rows = await activitiesRows(page)
      await rows.first().getByRole('link').click()
      await expect(page.getByRole('slider', { name: 'Selection start' })).toBeVisible()
    },
  },
]

for (const size of SIZES) {
  for (const { name, open } of PAGES) {
    test(`${name} keeps its chart labels apart at 200% text and text spacing, ${size.name}`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'Sets its own viewport')
      await page.setViewportSize({ width: size.width, height: size.height })
      await zoomText(page)
      await openSample(page)
      await open(page)
      await spaceText(page)
      await expectIntact(page)
    })
  }
}
