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
 * Walks the page one control at a time in both directions. Before each press the page is scrolled so the
 * control the press reaches is just out of view (above for Shift+Tab, below for Tab) and its neighbour, where
 * focus is, is in view; the browser then scrolls the new control in to the edge of the scrollport, which is
 * where `scroll-padding` decides how much of the page's sticky bars to clear. After each press the focused
 * control's centre must not lie under a sticky or fixed bar (WCAG 2.4.11 Focus Not Obscured). Returns the
 * presses that failed.
 */
async function obscuredPresses(page: Page): Promise<{ failures: string[]; presses: number }> {
  const count = await page.locator(TABBABLE).evaluateAll((els) => els.length)
  const failures: string[] = []
  let presses = 0
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
      await page.keyboard.press(key)
      presses += 1
      const hidden = await focusObscuredBy(page)
      if (hidden !== null) failures.push(`${key} to control ${i}: ${hidden}`)
    }
  }
  return { failures, presses }
}

const ONLY_DESKTOP = 'Walks one browser; the bars are the same'

test.describe('focus clears the sticky bars', () => {
  for (const sport of ['Run', 'Ride'] as const) {
    test(`${sport} at 1440 px: section row and header leave focus in view`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', ONLY_DESKTOP)
      await page.setViewportSize({ width: 1440, height: 900 })
      await openSample(page)
      await goTo(page, sport)
      await expect(page.locator('.section-nav')).toBeVisible()
      const { failures, presses } = await obscuredPresses(page)
      expect(presses).toBeGreaterThan(30)
      expect(failures).toEqual([])
    })
  }

  test('an activity at 390 px: the readout row and the tab bar leave focus in view', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', ONLY_DESKTOP)
    await page.setViewportSize({ width: 390, height: 844 })
    await openSample(page)
    const rows = await activitiesRows(page)
    await rows.first().getByRole('link').click()
    await expect(page.getByRole('slider', { name: 'Selection start' })).toBeVisible()
    const { failures, presses } = await obscuredPresses(page)
    expect(presses).toBeGreaterThan(10)
    expect(failures).toEqual([])
  })
})
