import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { activitiesRows, goTo, openSample } from './helpers'
import { TEXT_SPACING_CSS, clippedContent, svgTextOverlaps, zoomText } from './zoomProbes'

/**
 * WCAG 1.4.4 (text at 200%) and 1.4.12 (text spacing): chart labels stay apart, the page does not scroll
 * sideways, and no box cuts its text off. The table twin of each chart carries every value, so a label
 * the layout drops is still readable there.
 */
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const

/** Waits for the sections of a sport page, which are open to start with, so the charts in them are checked. */
async function openSections(page: Page): Promise<void> {
  const count = await page.locator('.sport-disclosure__summary').count()
  expect(count).toBeGreaterThan(0)
  await expect(page.locator('.sport-disclosure__details[open]')).toHaveCount(count)
}

/** Before the app starts, as a reader's own stylesheet is: the charts lay out their labels with the spacing in force. */
async function spaceText(page: Page): Promise<void> {
  await page.addInitScript((css) => {
    const add = (): boolean => {
      if (document.documentElement === null) return false
      const rule = document.createElement('style')
      rule.textContent = css
      document.documentElement.appendChild(rule)
      return true
    }
    if (!add())
      new MutationObserver((_, watcher) => add() && watcher.disconnect()).observe(document, {
        childList: true,
      })
  }, TEXT_SPACING_CSS)
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

/** The sport page's title, its text's own box, its ▸ Details summary, and whether the page scrolls sideways. */
async function titleRow(page: Page) {
  return page.evaluate(() => {
    const title = document.querySelector('.sport-page__title')!
    const summary = document.querySelector('.sport-page__head > .page-details > summary')!
    const words = document.createRange()
    words.selectNodeContents(title)
    const box = ({ top, bottom, left, right }: DOMRect) => ({ top, bottom, left, right })
    const root = document.documentElement
    return {
      title: box(title.getBoundingClientRect()),
      text: box(words.getBoundingClientRect()),
      summary: box(summary.getBoundingClientRect()),
      width: root.clientWidth,
      sideways: root.scrollWidth > root.clientWidth,
    }
  })
}

/** The Details sit on the title's line, clear of its words and inside the window, and nothing scrolls sideways. */
async function expectOneTitleLine(page: Page): Promise<void> {
  const row = await titleRow(page)
  const middle = (row.summary.top + row.summary.bottom) / 2
  expect(middle, JSON.stringify(row)).toBeGreaterThan(row.title.top)
  expect(middle, JSON.stringify(row)).toBeLessThan(row.title.bottom)
  expect(row.text.right).toBeLessThan(row.summary.left)
  expect(row.summary.right).toBeLessThanOrEqual(row.width + 0.5)
  expect(row.sideways).toBe(false)
}

for (const zoomed of [false, true]) {
  test(`the sport page's Details sit on its title's line on a phone${zoomed ? ', at 200% text' : ''}`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Sets its own viewport')
    await page.setViewportSize({ width: 390, height: 844 })
    if (zoomed) await zoomText(page)
    await openSample(page)
    for (const sport of ['Run', 'Ride'] as const) {
      await goTo(page, sport)
      await expect(page.locator('.sport-page__head > .page-details > summary')).toBeVisible()
      await expectOneTitleLine(page)
    }
  })
}

for (const size of SIZES) {
  for (const { name, open } of PAGES) {
    test(`${name} keeps its chart labels apart at 200% text and text spacing, ${size.name}`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'Sets its own viewport')
      await page.setViewportSize({ width: size.width, height: size.height })
      await zoomText(page)
      await spaceText(page)
      await openSample(page)
      await open(page)
      await expectIntact(page)
    })
  }
}
