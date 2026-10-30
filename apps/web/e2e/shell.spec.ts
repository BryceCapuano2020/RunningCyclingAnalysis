import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { goTo, openSample } from './helpers.js'
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
      tabs: edge('.header__tabs'),
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
