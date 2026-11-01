import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  activitiesRows,
  goTo,
  libraryLoaded,
  openSample,
  signInAs,
  uniqueEmail,
  uploadFixtures,
} from './helpers'
import type { Destination } from './helpers'
import { clippedContent, zoomText } from './zoomProbes'

/**
 * WCAG 1.4.10 Reflow with text at 200%: the root font is doubled, as a reader's own setting does, and no page scrolls
 * sideways or cuts its words off. The windows are a narrow phone and a tablet, where the wide layouts (the meter's
 * ends, a list row's figures, the Profile fields) used to be wider than the screen. A table that scrolls inside its
 * own box is allowed: its box is the scroller.
 */
const SIZES = [
  { name: 'narrow phone', width: 320, height: 640 },
  { name: 'tablet', width: 768, height: 1024 },
] as const

const PAGES: Destination[] = ['Balance', 'Run', 'Ride', 'Activities', 'Profile']

async function expectFits(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0)
  expect(await clippedContent(page)).toEqual([])
}

/** The tab bar's links, left to right: none overlaps the next, whether the bar fits or scrolls. */
async function expectTabsApart(page: Page): Promise<void> {
  const boxes = await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link')
    .evaluateAll((links) =>
      links.map((link) => {
        const { left, right } = link.getBoundingClientRect()
        return { left, right }
      }),
    )
  expect(boxes).toHaveLength(4)
  for (let i = 1; i < boxes.length; i += 1) {
    expect(boxes[i]!.left).toBeGreaterThanOrEqual(boxes[i - 1]!.right - 1)
  }
}

for (const size of SIZES) {
  test.describe(`text at 200%, ${size.name}`, () => {
    test.beforeEach(async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'Sets its own viewport')
      await page.setViewportSize({ width: size.width, height: size.height })
      await zoomText(page)
    })

    test('the landing page does not scroll sideways', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expectFits(page)
    })

    for (const destination of PAGES) {
      test(`${destination} does not scroll sideways`, async ({ page }) => {
        await openSample(page)
        await goTo(page, destination)
        await expectFits(page)
        if (destination === 'Balance') await expectTabsApart(page)
      })
    }

    test('the offer of what this browser kept wraps the account’s email, and the avatar holds its initials', async ({
      page,
    }) => {
      const email = uniqueEmail()
      await page.goto('/')
      await uploadFixtures(page, ['one-run.fit'])
      // The headline moves from the Balance title to the level title as the analysis settles, so wait on the kept file.
      await libraryLoaded(page, 1)
      await signInAs(page.request, email, 'Ada Lovelace')
      await page.goto('/')
      const offer = page.getByRole('region', { name: 'Activities kept in this browser' })
      await expect(offer).toContainText(email)
      await expectFits(page)
      const box = await offer.boundingBox()
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width)
      const avatar = page.locator('.account-menu__avatar')
      await expect(avatar).toBeVisible()
      expect(await avatar.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
    })

    test('the Settings over time form on Profile wraps, signed in', async ({ page }) => {
      await page.goto('/')
      await uploadFixtures(page, ['one-run.fit'])
      await libraryLoaded(page, 1)
      await signInAs(page.request, uniqueEmail(), 'Ada Lovelace')
      await page.goto('/')
      await goTo(page, 'Profile')
      const form = page.getByRole('region', { name: 'Settings over time' })
      await expect(form).toBeVisible()
      await expect(form.getByRole('button', { name: 'Add' })).toBeEnabled()
      await expectFits(page)
      const box = await form.boundingBox()
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width)
    })

    test('an activity does not scroll sideways', async ({ page }) => {
      await openSample(page)
      const rows = await activitiesRows(page)
      await rows.first().getByRole('link').click()
      await expect(page.getByRole('slider', { name: 'Selection start' })).toBeVisible()
      await expectFits(page)
    })
  })
}

test('the Balance headline is on the first screen of a phone, above the tab bar', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Sets its own viewport')
  await page.setViewportSize({ width: 390, height: 844 })
  await openSample(page)
  const [headline, tabs] = await Promise.all([
    page.getByRole('main').getByRole('heading', { level: 1 }).boundingBox(),
    page.getByRole('navigation', { name: 'Sections' }).boundingBox(),
  ])
  // The fitness card leads by design (Stage C), so the headline starts low, but all of it is above the bar.
  expect(headline!.y + headline!.height).toBeLessThanOrEqual(tabs!.y)
})
