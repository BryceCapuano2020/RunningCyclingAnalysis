import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  activitiesRows,
  firstScreenFoot,
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

/**
 * The page links, the rail's three and the header's that are shown (History and Activities, and Method above 360 px):
 * none overlaps another, wherever the rows wrap.
 */
async function expectTabsApart(page: Page): Promise<void> {
  const boxesOf = (name: string) =>
    page
      .getByRole('navigation', { name, exact: true })
      .getByRole('link')
      .evaluateAll((links) =>
        links
          .map((link) => {
            const { left, right, top, bottom, width } = link.getBoundingClientRect()
            return { left, right, top, bottom, width }
          })
          .filter((box) => box.width > 0),
      )
  const rail = await boxesOf('Pages')
  const header = await boxesOf('More pages')
  expect(rail).toHaveLength(4)
  expect(header.length).toBeGreaterThanOrEqual(2)
  const boxes = [...rail, ...header]
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const apart =
        a.right <= b.left + 1 ||
        b.right <= a.left + 1 ||
        a.bottom <= b.top + 1 ||
        b.bottom <= a.top + 1
      expect(apart).toBe(true)
    }
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
      // The account is its first name in the header, shown whole: not cut short by its ellipsis.
      const name = page.locator('.account-menu__name')
      await expect(name).toHaveText('Ada')
      expect(await name.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
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

test('the Balance headline is on the first screen of a phone, under the rail', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Sets its own viewport')
  await page.setViewportSize({ width: 390, height: 844 })
  await openSample(page)
  const [headline, rail] = await Promise.all([
    page.getByRole('main').getByRole('heading', { level: 1 }).boundingBox(),
    page.locator('.rail').boundingBox(),
  ])
  // The balance leads the page: all of the headline is under the rail and on the first screen.
  expect(headline!.y).toBeGreaterThanOrEqual(rail!.y + rail!.height)
  expect(headline!.y + headline!.height).toBeLessThanOrEqual(await firstScreenFoot(page))
})
