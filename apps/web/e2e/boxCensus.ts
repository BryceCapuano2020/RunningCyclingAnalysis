/// <reference lib="dom" />
import type { Page } from '@playwright/test'

/** What the census found on one page: the boxes it counts and the share of the page they cover. */
export interface BoxCensus {
  /** The page height the share is taken of: the height of `main`. */
  height: number
  /** The share of that height covered by a box, 0 to 1. Boxes inside boxes count once. */
  share: number
  /** The boxes, outermost first, so a failure says which element to de-box. */
  boxes: string[]
}

/**
 * Counts the boxes on a page: a block at least `minHeight` tall and 200 px wide that draws its own surface,
 * whatever its corners: a fill that differs from the page, a border or an outline on three or more sides, or a
 * shadow. Controls, text chips and the figures themselves (charts, zone bars, tracks, which are data and not
 * furniture) are left out. Heights are merged as intervals, so a box inside another adds nothing.
 */
export async function boxCensus(page: Page, minHeight = 24): Promise<BoxCensus> {
  return page.evaluate((minHeight) => {
    const main = document.querySelector('main')
    if (main === null) throw new Error('no main element')
    const top = main.getBoundingClientRect().top + window.scrollY
    const height = main.getBoundingClientRect().height
    const pageFill = getComputedStyle(document.body).backgroundColor
    // Forced colours paint every element Canvas, so a fill says nothing there; borders and outlines still do.
    const forced = matchMedia('(forced-colors: active)').matches
    const sides = ['top', 'right', 'bottom', 'left']
    const spans: { from: number; to: number; name: string }[] = []
    for (const el of main.querySelectorAll('*')) {
      if (
        el instanceof SVGElement ||
        el.closest(
          'button, input, select, textarea, label, svg, figure, [role="radiogroup"], [role="group"], [role="img"], [aria-hidden="true"], .segmented, [class*="track"], [class*="bar"], [class*="meter"], [class*="zone"], [class*="ladder"]',
        ) !== null
      )
        continue
      const style = getComputedStyle(el)
      const drawn = (prefix: string, widthOf: (side: string) => string) =>
        sides.filter(
          (side) =>
            parseFloat(widthOf(side)) > 0 &&
            style.getPropertyValue(`${prefix}-${side}-style`) !== 'none',
        ).length
      const edged = drawn('border', (side) => style.getPropertyValue(`border-${side}-width`)) >= 3
      const outlined = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0
      const filled =
        !forced &&
        style.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
        style.backgroundColor !== pageFill
      const lifted = style.boxShadow !== 'none'
      if (!edged && !outlined && !filled && !lifted) continue
      const rect = el.getBoundingClientRect()
      if (rect.height < minHeight || rect.width < 200) continue
      const name = `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').split(' ')[0]}`
      spans.push({
        from: rect.top + window.scrollY - top,
        to: rect.bottom + window.scrollY - top,
        name,
      })
    }
    spans.sort((a, b) => a.from - b.from)
    let covered = 0
    let reach = -Infinity
    for (const { from, to } of spans) {
      if (to <= reach) continue
      covered += to - Math.max(from, reach)
      reach = to
    }
    return { height, share: height > 0 ? covered / height : 0, boxes: spans.map((s) => s.name) }
  }, minHeight)
}
