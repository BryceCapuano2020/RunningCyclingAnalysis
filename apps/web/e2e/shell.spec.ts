import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { BALANCE_TITLE, goTo, openSample, uploadFixtures } from './helpers.js'
import type { Destination } from './helpers.js'

const DESTINATIONS: Destination[] = ['Balance', 'Run', 'Ride', 'Activities', 'Profile']

/** Where the header's brand, the tabs and the page's column sit, in CSS pixels from the window's left edge. */
async function shellEdges(page: Page) {
  return page.evaluate(() => {
    const edge = (selector: string) => {
      const box = document.querySelector(selector)?.getBoundingClientRect()
      if (!box) throw new Error(`no ${selector}`)
      return { x: Math.round(box.x * 10) / 10, width: Math.round(box.width * 10) / 10 }
    }
    return {
      brand: edge('.header__brand'),
      tabs: edge('.header__pages'),
      page: edge('.page'),
    }
  })
}

test('the header, the tabs and the page keep one place and width on every page at 1440', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Measures the desktop shell')
  await page.setViewportSize({ width: 1440, height: 900 })
  await openSample(page)
  const first = await shellEdges(page)
  for (const destination of DESTINATIONS) {
    await goTo(page, destination)
    expect(await shellEdges(page), `${destination} moves the header`).toEqual(first)
  }
  // One shell: 1,200 px centred, so the page starts 120 px in, and the header's contents with it.
  expect(first.page).toEqual({ x: 120, width: 1200 })
})

/** The top of the page's h1, in CSS pixels from the top of the document. */
async function titleTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const h1 = document.querySelector('h1')
    if (h1 === null) throw new Error('no h1')
    return Math.round(h1.getBoundingClientRect().top + window.scrollY)
  })
}

for (const width of [1280, 390]) {
  test(`the title sits at one height on Balance, Run and Ride at ${width}`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'Measures the shell at set widths')
    await page.setViewportSize({ width, height: 900 })
    // A reader's own library, a run and rides: the notes about it sit in each page's Details, not above the title. The
    // import's summary is a notice the reader dismisses; with it gone nothing stands above any page's title.
    await page.goto('/')
    await uploadFixtures(page, ['sample-export.zip'])
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
    await page.getByRole('button', { name: 'Dismiss summary' }).click()
    await expect(page.locator('.import-notice')).toHaveCount(0)
    // A first visit to each page may carry a notice that is shown once; the second pass is what a reader switches between.
    for (const destination of ['Run', 'Ride', 'Balance'] as const) await goTo(page, destination)
    const tops: Record<string, number> = {}
    for (const destination of ['Run', 'Ride', 'Balance'] as const) {
      await goTo(page, destination)
      tops[destination] = await titleTop(page)
    }
    expect(Math.abs(tops.Run! - tops.Balance!), JSON.stringify(tops)).toBeLessThanOrEqual(1)
    expect(Math.abs(tops.Ride! - tops.Balance!), JSON.stringify(tops)).toBeLessThanOrEqual(1)
  })
}
