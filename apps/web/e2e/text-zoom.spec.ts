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

test('the section pills stay one scrolling row at normal text on a phone', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Sets its own viewport')
  await page.setViewportSize({ width: 390, height: 844 })
  await openSample(page)
  await goTo(page, 'Run')
  const list = page.locator('.section-nav__list')
  await expect(list).toBeVisible()
  const box = await list.boundingBox()
  // One row of pills (a control tall, with the list's padding), not several wrapped rows.
  expect(box?.height ?? Infinity).toBeLessThanOrEqual(72)
  expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
})

test('the section pills wrap to more rows, and stay on screen, at 200% text on a phone', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Sets its own viewport')
  await page.setViewportSize({ width: 390, height: 844 })
  await zoomText(page)
  await openSample(page)
  await goTo(page, 'Run')
  const list = page.locator('.section-nav__list')
  expect((await list.boundingBox())?.height ?? 0).toBeGreaterThan(72)
  expect(await list.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
})
