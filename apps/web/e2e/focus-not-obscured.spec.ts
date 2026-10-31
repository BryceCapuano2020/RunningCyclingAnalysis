import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { focusObscuredBy } from './a11yProbes.js'
import { activitiesRows, goTo, openSample } from './helpers.js'

/** The controls in `main` that the page tabs through. */
const TABBABLE =
  'main a[href], main button, main summary, main input, main select, main [tabindex="0"]'

/** How far past the edge the control to reach is placed, so the browser has to scroll to it. */
const PAST_EDGE_PX = 12

/**
 * Waits until the page has stopped scrolling: its scroll position is the same on several frames in a row. A
 * scroll the browser starts (a focus, a key, smooth scrolling) can land a frame or two later, and positions read
 * before then are the old ones.
 */
async function scrollSettled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = scrollY
        let still = 0
        let frames = 0
        const tick = () => {
          frames += 1
          still = scrollY === last ? still + 1 : 0
          last = scrollY
          if (still >= 3 || frames > 120) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )
}

/**
 * Walks the page one control at a time in both directions. Before each press the page is scrolled so the
 * control the press reaches is just out of view (above for Shift+Tab, below for Tab) and its neighbour, where
 * focus is, is in view; the browser then scrolls the new control in to the edge of the scrollport, which is
 * where `scroll-padding` decides how much of the page's sticky bars to clear. After each press the focused
 * control's centre must not lie under a sticky or fixed bar (WCAG 2.4.11 Focus Not Obscured). Returns the
 * presses that failed and how many of them scrolled the page.
 */
async function obscuredPresses(page: Page): Promise<{ failures: string[]; scrolled: number }> {
  const count = await page.locator(TABBABLE).evaluateAll((els) => els.length)
  const failures: string[] = []
  let scrolled = 0
  for (const key of ['Shift+Tab', 'Tab'] as const) {
    for (let i = 1; i < count - 1; i += 1) {
      const ready = await page.evaluate(
        ({ selector, index, key, past }) => {
          const all = [...document.querySelectorAll<HTMLElement>(selector)].filter(
            (el) =>
              el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden',
          )
          const from = all[index]
          const to = all[key === 'Tab' ? index + 1 : index - 1]
          if (from === undefined || to === undefined) return false
          const style = getComputedStyle(document.documentElement)
          const top = parseFloat(style.scrollPaddingTop) || 0
          const bottom = parseFloat(style.scrollPaddingBottom) || 0
          const target = to.getBoundingClientRect()
          // Put the target `past` pixels beyond the edge that its scroll padding keeps clear.
          const shift =
            key === 'Tab' ? target.top - (innerHeight - bottom) + past : target.bottom - top - past
          scrollBy(0, shift)
          from.focus({ preventScroll: true })
          return document.activeElement === from
        },
        { selector: TABBABLE, index: i, key, past: PAST_EDGE_PX },
      )
      if (!ready) continue
      await scrollSettled(page)
      const before = await page.evaluate(() => scrollY)
      await page.keyboard.press(key)
      await scrollSettled(page)
      // Only a press that made the browser scroll tests the scroll padding.
      if ((await page.evaluate(() => scrollY)) !== before) scrolled += 1
      const hidden = await focusObscuredBy(page)
      if (hidden !== null) failures.push(`${key} to control ${i}: ${hidden}`)
    }
  }
  return { failures, scrolled }
}

/** The presses on a page that must have scrolled it, so a walk that never scrolls cannot pass. */
const MIN_SCROLLED = 15

/** The sport and activity pages, with the stuck bars each width has: the section row at 1440, the tab bar at 390. */
async function openPage(page: Page, destination: 'Run' | 'Ride' | 'Activity', width: number) {
  await page.setViewportSize({ width, height: width > 760 ? 900 : 844 })
  await openSample(page)
  if (destination === 'Activity') {
    const rows = await activitiesRows(page)
    await rows.first().getByRole('link').click()
    await expect(page.getByRole('slider', { name: 'Selection start' })).toBeVisible()
  } else {
    await goTo(page, destination)
  }
}

async function expectFocusClear(page: Page): Promise<void> {
  // Each press waits for its scroll to settle, so a walk is a few hundred waits.
  test.setTimeout(120_000)
  const { failures, scrolled } = await obscuredPresses(page)
  expect(scrolled).toBeGreaterThanOrEqual(MIN_SCROLLED)
  expect(failures).toEqual([])
}

test.describe('focus clears the sticky bars', () => {
  for (const sport of ['Run', 'Ride'] as const) {
    test(`${sport} at 1440 px: section row and header leave focus in view`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'A 1440 px window is a desktop case')
      await openPage(page, sport, 1440)
      await expect(page.locator('.section-nav')).toBeVisible()
      await expectFocusClear(page)
    })

    test(`${sport} at 390 px: the header and the tab bar leave focus in view`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'mobile-webkit', 'The phone case, in WebKit')
      await openPage(page, sport, 390)
      await expectFocusClear(page)
    })
  }

  test('an activity at 390 px: the readout row and the tab bar leave focus in view', async ({
    page,
  }, testInfo) => {
    test.skip(!['desktop', 'mobile-webkit'].includes(testInfo.project.name), 'Chromium and WebKit')
    await openPage(page, 'Activity', 390)
    await expectFocusClear(page)
  })
})
