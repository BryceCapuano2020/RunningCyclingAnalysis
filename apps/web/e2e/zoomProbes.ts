/// <reference lib="dom" />
import type { Page } from '@playwright/test'

/** WCAG 1.4.12 text spacing: the least a page must survive when a reader sets these (applied with !important). */
export const TEXT_SPACING_CSS = `
  * {
    line-height: 1.5 !important;
    letter-spacing: 0.12em !important;
    word-spacing: 0.16em !important;
  }
  p { margin-bottom: 2em !important; }
`

/** Two chart labels whose boxes meet, with the area they share in square pixels. */
export interface LabelOverlap {
  first: string
  second: string
  area: number
  /** The chart's title, and the two labels' classes, so a failure says where to look. */
  where: string
}

/**
 * Chart labels drawn over one another. Every `svg text` under `selector` (a label and its range line are
 * one text element, so they cannot collide with themselves) is measured by its box; two that share more
 * than `minArea` square pixels are an overlap. Labels the reader cannot see (no box, or hidden) are left out.
 */
export async function svgTextOverlaps(
  page: Page,
  selector: string,
  minArea = 4,
): Promise<LabelOverlap[]> {
  return page.evaluate(
    ({ selector, minArea }) => {
      const labels: { text: string; rect: DOMRect; cls: string; chart: string }[] = []
      for (const el of document.querySelectorAll(`${selector} svg text`)) {
        const rect = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        if (rect.width <= 1 || rect.height <= 1 || style.visibility === 'hidden') continue
        if (style.display === 'none' || style.opacity === '0') continue
        // A text's box is the font's whole line, ascent and descent included, so stacked lines touch by design:
        // the ink is taken as the middle 70% of the height.
        const trim = rect.height * 0.15
        labels.push({
          text: (el.textContent ?? '').trim(),
          rect: new DOMRect(rect.x, rect.y + trim, rect.width, rect.height - 2 * trim),
          cls:
            String(el.getAttribute('class') ?? '') ||
            String(el.parentElement?.getAttribute('class') ?? ''),
          chart: (el.closest('figure')?.querySelector('figcaption')?.textContent ?? '')
            .trim()
            .slice(0, 40),
        })
      }
      const found: { first: string; second: string; area: number; where: string }[] = []
      for (let i = 0; i < labels.length; i += 1) {
        for (let j = i + 1; j < labels.length; j += 1) {
          const a = labels[i]!.rect
          const b = labels[j]!.rect
          const width = Math.min(a.right, b.right) - Math.max(a.left, b.left)
          const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
          if (width > 0 && height > 0 && width * height > minArea) {
            found.push({
              first: labels[i]!.text,
              second: labels[j]!.text,
              area: Math.round(width * height),
              where: `${labels[i]!.chart} | ${labels[i]!.cls} / ${labels[j]!.cls}`,
            })
          }
        }
      }
      return found
    },
    { selector, minArea },
  )
}

/**
 * Elements that hide their own overflow while their content is wider than they are, so text is cut off
 * (WCAG 1.4.4 and 1.4.12: nothing may be lost when text grows). Scrollers (`auto`, `scroll`) are left out:
 * their content is reachable. Returns a short description of each.
 */
export async function clippedContent(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = []
    for (const el of document.querySelectorAll('main *, header *')) {
      if (el instanceof SVGElement) continue
      // Visually hidden text (a box of one pixel) is not shown, so nothing of it is lost.
      const box = el.getBoundingClientRect()
      if (box.width <= 1 || box.height <= 1) continue
      const style = getComputedStyle(el)
      if (style.overflowX !== 'hidden' && style.overflowX !== 'clip') continue
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 1) {
        const name = (el.textContent ?? '').trim().slice(0, 24)
        found.push(
          `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} "${name}" ${el.scrollWidth}>${el.clientWidth}`,
        )
      }
    }
    return found
  })
}

/** Before the app starts: the charts measure their labels at the larger root size, with age grades on. */
export async function zoomText(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // A style rule, not an inline style: the parser can replace the root before the page's own scripts run.
    const add = (): boolean => {
      if (document.documentElement === null) return false
      const rule = document.createElement('style')
      rule.textContent = 'html { font-size: 200% !important; }'
      document.documentElement.appendChild(rule)
      return true
    }
    if (!add())
      new MutationObserver((_, watcher) => add() && watcher.disconnect()).observe(document, {
        childList: true,
      })
    localStorage.setItem(
      'rca.preferences.v1',
      JSON.stringify({
        settings: { massKg: 75, bikeMassKg: 9 },
        units: 'metric',
        birthYear: 1986,
        sex: 'male',
        setupDone: true,
      }),
    )
  })
}
