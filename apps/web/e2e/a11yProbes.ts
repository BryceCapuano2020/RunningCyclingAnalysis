/// <reference lib="dom" />
import type { Page } from '@playwright/test'

/** One text run that overlaps another that is not part of it. */
export interface TextOverlap {
  first: string
  second: string
  area: number
}

/**
 * Finds text drawn over other text. Every text node under `selector` gives the boxes of its lines; two boxes
 * from unrelated elements (neither holds the other) that share more than `minArea` square pixels are an overlap.
 * Text a reader cannot see (hidden, or clipped to a pixel) and runs in one block (a passage's own leading) are left out. Axe does not measure this.
 */
export async function textOverlaps(
  page: Page,
  selector: string,
  minArea = 4,
): Promise<TextOverlap[]> {
  return page.evaluate(
    ({ selector, minArea }) => {
      // Text in a box clipped to a pixel (visually hidden) is not seen, so it cannot be overlapped.
      const clippedAway = (el: Element): boolean => {
        for (let up: Element | null = el; up !== null; up = up.parentElement) {
          const box = up.getBoundingClientRect()
          if ((box.width <= 1 || box.height <= 1) && getComputedStyle(up).overflow !== 'visible') {
            return true
          }
        }
        return false
      }
      // The block a run's lines flow in: two runs in one block are one passage, set at its own leading.
      const blockOf = (el: Element): Element => {
        let up: Element = el
        while (up.parentElement !== null && getComputedStyle(up).display.startsWith('inline')) {
          up = up.parentElement
        }
        return up
      }
      const runs: { el: Element; rect: DOMRect; text: string }[] = []
      for (const root of document.querySelectorAll(selector)) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const text = node.textContent?.trim() ?? ''
          const el = node.parentElement
          if (text === '' || el === null) continue
          if (getComputedStyle(el).visibility === 'hidden' || clippedAway(el)) continue
          const range = document.createRange()
          range.selectNodeContents(node)
          for (const rect of range.getClientRects()) {
            if (rect.width <= 1 || rect.height <= 1) continue
            runs.push({ el, rect, text })
          }
        }
      }
      const found: { first: string; second: string; area: number }[] = []
      for (let i = 0; i < runs.length; i += 1) {
        for (let j = i + 1; j < runs.length; j += 1) {
          const a = runs[i]!
          const b = runs[j]!
          if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue
          if (blockOf(a.el) === blockOf(b.el)) continue
          const width = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left)
          const height = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top)
          if (width > 0 && height > 0 && width * height > minArea) {
            found.push({ first: a.text, second: b.text, area: Math.round(width * height) })
          }
        }
      }
      return found
    },
    { selector, minArea },
  )
}

/** How far the page is wider than the window, and the primary controls whose box leaves the page's width. */
export async function reflowProblems(page: Page): Promise<{ overflow: number; clipped: string[] }> {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const clipped: string[] = []
    for (const el of document.querySelectorAll(
      'main a[href], main button, header a, header button',
    )) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      // A row that scrolls sideways on purpose keeps its controls past the edge.
      if (el.closest('.section-nav__list, .range-picker, [data-scrolls]')) continue
      if (rect.right > width + 1 || rect.left < -1) {
        clipped.push(`${el.tagName.toLowerCase()} ${(el.textContent ?? '').trim().slice(0, 30)}`)
      }
    }
    return { overflow: document.documentElement.scrollWidth - innerWidth, clipped }
  })
}

/**
 * Names the sticky or fixed bar (not the focused element's ancestor, nor a part of it) that covers the centre of
 * the focused element, or null. Focus a bar hides is lost to a keyboard user (WCAG 2.4.11 Focus Not Obscured);
 * the centre rather than the whole box, because a control a bar covers by half is as lost as one it covers all of.
 */
export async function focusObscuredBy(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const focused = document.activeElement
    if (focused === null || focused === document.body) return null
    const box = focused.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return null
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    for (const el of document.querySelectorAll('body *')) {
      const position = getComputedStyle(el).position
      if (position !== 'sticky' && position !== 'fixed') continue
      if (el.contains(focused) || focused.contains(el)) continue
      const bar = el.getBoundingClientRect()
      if (bar.width === 0 || bar.height === 0) continue
      if (x >= bar.left && x <= bar.right && y >= bar.top && y <= bar.bottom) {
        const name = (focused.textContent ?? '').trim().slice(0, 30)
        return `${focused.tagName.toLowerCase()} "${name}" is under ${el.className || el.tagName}`
      }
    }
    return null
  })
}
