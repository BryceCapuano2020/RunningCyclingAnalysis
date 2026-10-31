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
 * Counts the boxes on a page: a block taller than `minHeight` that draws its own edge (a border with a
 * radius) or a shadow. Controls, chips and tiles under that height are content, not furniture. Heights are
 * merged as intervals, so a box inside another adds nothing.
 */
export async function boxCensus(page: Page, minHeight = 40): Promise<BoxCensus> {
  return page.evaluate((minHeight) => {
    const main = document.querySelector('main')
    if (main === null) throw new Error('no main element')
    const top = main.getBoundingClientRect().top + window.scrollY
    const height = main.getBoundingClientRect().height
    const spans: { from: number; to: number; name: string }[] = []
    for (const el of main.querySelectorAll('*')) {
      if (
        el instanceof SVGElement ||
        el.closest(
          'button, input, select, textarea, label, [role="radiogroup"], [role="group"], .segmented',
        ) !== null
      )
        continue
      const style = getComputedStyle(el)
      const edged =
        ['top', 'right', 'bottom', 'left'].some(
          (side) =>
            parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 &&
            style.getPropertyValue(`border-${side}-style`) !== 'none',
        ) && style.borderTopLeftRadius !== '0px'
      const lifted = style.boxShadow !== 'none'
      if (!edged && !lifted) continue
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
