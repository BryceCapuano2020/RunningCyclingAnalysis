import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { goTo, openSample } from './helpers'
import type { Destination } from './helpers'

/**
 * WCAG 2.5.8 Target Size (Minimum): every control a pointer can press is at least 24 by 24 px, and the app's own
 * standard is 40 px (44 on a finger) for a control that stands alone, and for any link under a finger. Measured on the elements' own boxes, which is
 * stricter than the hit area some of them add with a pseudo-element. Left out: a link set inside a sentence (the
 * spec's inline exception) and the activity list's name link, whose pseudo-element covers the whole row (the row is
 * measured instead).
 */
const FLOOR_PX = 24
const STANDARD_PX = 40

interface Small {
  what: string
  width: number
  height: number
}

async function smallTargets(page: Page, standardPx: number): Promise<Small[]> {
  return page.evaluate((standardPx) => {
    const found: { what: string; width: number; height: number }[] = []
    const selector =
      'a[href], button, input:not([type=hidden]):not(.segmented-control__radio), select, textarea, summary, [role=slider]'
    for (const el of document.querySelectorAll(selector)) {
      const style = getComputedStyle(el)
      let box = el.getBoundingClientRect()
      if (box.width <= 1 || box.height <= 1 || style.visibility === 'hidden') continue
      // The row's name link is stretched over its row by a pseudo-element.
      if (el.classList.contains('activity-list__name')) {
        box = (el.closest('li') ?? el).getBoundingClientRect()
      }
      // A link in a sentence: inline, with words of its own paragraph around it.
      const prose = el.closest('p, li, dd')
      const inSentence =
        el.tagName === 'A' &&
        style.display === 'inline' &&
        prose !== null &&
        (prose.textContent ?? '').trim().length > (el.textContent ?? '').trim().length + 12
      if (inSentence) continue
      // A defined term in a sentence is inline too, as tall as its line: its lines touch, so room above would put a
      // term's press area over the one on the line above. Standing alone it is at least the floor.
      const term = el.classList.contains('definition__term')
      if (term && el.closest('p, li, dd, td') !== null) continue
      // A link on a line of text (the footer's, a record's, the landing's) is as high as its line on a mouse, which
      // is the floor; a finger gets the standard. A button or field is the standard for either.
      const fine = matchMedia('(pointer: fine)').matches
      const lineLink = el.tagName === 'A' && fine && !el.classList.contains('cross-sport__link')
      const least = term || lineLink ? 24 : standardPx
      if (box.height < least || box.width < 24) {
        found.push({
          what: `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').split(' ')[0]} "${(el.textContent ?? '').trim().slice(0, 28)}"`,
          width: Math.round(box.width),
          height: Math.round(box.height),
        })
      }
    }
    return found
  }, standardPx)
}

/** Opens each closed section of a sport page, so the controls inside them are on the page to be measured. */
async function openSections(page: Page): Promise<void> {
  const summaries = page.locator('.sport-disclosure__summary')
  const count = await summaries.count()
  for (let i = 0; i < count; i += 1) {
    await summaries.nth(i).click()
    await expect(page.locator('.sport-disclosure__details[open]')).toHaveCount(i + 1)
  }
}

const PAGES: Destination[] = ['Balance', 'Run', 'Ride', 'Activities', 'Profile']

test.describe('target size', () => {
  test('the landing page has no target under the standard', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await smallTargets(page, STANDARD_PX)).toEqual([])
  })

  for (const destination of PAGES) {
    test(`${destination} has no target under the standard`, async ({ page }) => {
      await openSample(page)
      await goTo(page, destination)
      if (destination === 'Run' || destination === 'Ride') await openSections(page)
      expect(await smallTargets(page, STANDARD_PX)).toEqual([])
    })
  }

  test('an activity has no target under the standard', async ({ page }) => {
    await openSample(page)
    await goTo(page, 'Activities')
    await page.locator('.activity-list__items > li').first().getByRole('link').click()
    await expect(page.getByRole('slider', { name: 'Selection start' })).toBeVisible()
    expect(await smallTargets(page, STANDARD_PX)).toEqual([])
  })

  test('no target on the pages is under the WCAG floor of 24 px, tall or wide', async ({
    page,
  }) => {
    await openSample(page)
    for (const destination of PAGES) {
      await goTo(page, destination)
      if (destination === 'Run' || destination === 'Ride') await openSections(page)
      expect(await smallTargets(page, FLOOR_PX), destination).toEqual([])
    }
  })
})
