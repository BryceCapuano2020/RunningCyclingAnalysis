import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { edgesOf, goTo, openSample, trackErrors } from './helpers.js'

const CARD = '.fitness-card'
const CHART = /^Pace at \d+ bpm over time$/

/** A line's words as read, without the notes its defined terms keep in the markup. */
const spoken = (line: Locator) =>
  line.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement
    copy.querySelectorAll('.definition__note').forEach((note) => note.remove())
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
  })

/** The sample's fitness card, on the page the test is on. */
const card = (page: Page) => page.locator(CARD)

test('the sample leads Balance with a fitness status that is new, with its range and the runs behind it', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)
  await expect(page.getByRole('region', { name: 'Your fitness' })).toBeVisible()
  await expect(card(page).locator('.fitness-card__state')).toHaveText('Slipping')
  // The words: the heart rate it is read at, the size with its 90% range, and the evidence behind it.
  expect(await spoken(card(page).locator('.fitness-card__headline'))).toMatch(
    /^At \d+ bpm you now run \d+:\d{2}\s\/(km|mi), [\d.]+% \(\d+ to \d+%\) slower than the \d+:\d{2}\s\/(km|mi) before \d{1,2} [A-Z][a-z]{2}\.$/,
  )
  expect(await spoken(card(page).locator('.fitness-card__support'))).toMatch(
    /steady runs, .* against \d+ in the/,
  )
  await expect(page.getByTestId('fitness-new')).toHaveText(
    /^Newsince the week of \d{1,2} [A-Z][a-z]{2}$/,
  )
  // The state is a shape as well as a word, and the change is a track: both drawn, both hidden from a screen reader.
  await expect(card(page).locator('.fitness-glyph')).toHaveAttribute('aria-hidden', 'true')
  await expect(card(page).locator('.fitness-track__band')).toBeVisible()
  await expect(card(page).locator('.fitness-track__ring')).toBeVisible()
  expect(errors).toEqual([])
})

test('See the evidence opens a chart with its table twin, the method, the limit once and the runs as links', async ({
  page,
}) => {
  await openSample(page)
  // Closed, the panel draws and measures nothing.
  await expect(page.getByRole('figure', { name: CHART })).toHaveCount(0)
  await page.getByText('See the evidence').click()
  const chart = page.getByRole('figure', { name: CHART })
  await expect(chart).toBeVisible()
  // The chart: a ring and a range for each four-week step, the line it is read against, the month it began, and now.
  expect(await chart.locator('[data-testid="fitness-point"]').count()).toBeGreaterThanOrEqual(7)
  await expect(chart.locator('[data-testid="fitness-now"]')).toHaveCount(1)
  await expect(chart.locator('[data-annotation="before"]')).toContainText(/^Before /)
  await expect(chart.locator('[data-testid="fitness-onset"]')).toContainText(/^Began /)
  // Its table twin has a row for each step.
  const steps = await chart.locator('[data-testid="fitness-point"]').count()
  await chart.getByText('View as table').click()
  await expect(chart.locator('table').nth(1).locator('tbody tr')).toHaveCount(steps + 1)
  // The method and the honest limit, said once; and why some runs do not count.
  const panel = page.locator('.fitness-evidence')
  await expect(panel.getByRole('heading', { name: 'How it is measured' })).toBeVisible()
  await expect(panel).toContainText('a change of about 5% or more, within weeks to a few months')
  expect(await panel.getByText(/about 5% or more/).count()).toBe(1)
  await expect(panel.getByRole('heading', { name: /^Why some runs do not count$/ })).toBeVisible()
  // The runs it rests on are links to their activities, newest first.
  const links = panel.locator('.fitness-runs a')
  expect(await links.count()).toBeGreaterThanOrEqual(6)
  const first = links.first()
  const href = await first.getAttribute('href')
  expect(href).toMatch(/^#\/activities\//)
  await first.click()
  await expect(page).toHaveURL(new RegExp(`${href!.replace('#', '#')}$`))
  await expect(page.getByRole('link', { name: /^Back to/ })).toBeVisible()
})

test('a keyboard reaches the disclosure, opens it with Enter and reads the chart with the arrow keys', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Keyboard reading is checked on the desktop project',
  )
  await openSample(page)
  const summary = page.locator('.fitness-card__evidence > summary')
  await summary.focus()
  await expect(summary).toBeFocused()
  await page.keyboard.press('Enter')
  const chart = page.getByRole('figure', { name: CHART })
  await expect(chart).toBeVisible()
  const plot = chart.locator('.plot-surface')
  await plot.focus()
  await page.keyboard.press('ArrowRight')
  await expect(chart.locator('.chart-tooltip__title')).toContainText(
    /^The \d+ weeks to \d{1,2} [A-Z][a-z]{2}$/,
  )
  await expect(chart.locator('.chart-tooltip')).toContainText(/90% range .* to .*; \d+ steady runs/)
})

test('the terms that carry the answer are defined in place: the heart rate, the range and a steady run', async ({
  page,
}) => {
  await openSample(page)
  // Each is opened and closed in turn with the keyboard: on a phone a note is a sheet at the window's foot, which
  // covers the terms below it until it is closed.
  // The support line (where "steady runs" first stands) is left out on a short phone, so the third term is the one
  // in how the figure is measured, which every phone has.
  await page.getByText('See the evidence').click()
  const terms: [Locator, RegExp][] = [
    [card(page).getByRole('button', { name: /^At \d+ bpm$/ }), /one heart rate, \d+ bpm/],
    [card(page).getByRole('button', { name: /^\(\d+ to \d+%\)$/ }), /nine times out of ten/],
    [
      card(page)
        .locator('.fitness-evidence')
        .getByRole('button', { name: 'steady run', exact: true }),
      /Intervals, hilly runs and treadmill runs do not count/,
    ],
  ]
  for (const [term, meaning] of terms) {
    await term.focus()
    await page.keyboard.press('Enter')
    await expect(term).toHaveAttribute('aria-expanded', 'true')
    await expect(card(page).getByRole('note').filter({ hasText: meaning })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(term).toHaveAttribute('aria-expanded', 'false')
  }
})

/** The terms of a paragraph with the box each takes on the page, in the order they are read. */
const termBoxes = (scope: Locator) =>
  scope.evaluate((root) =>
    [...root.querySelectorAll('.definition__term')].map((term, index) => {
      const box = term.getBoundingClientRect()
      return {
        index,
        text: term.textContent ?? '',
        left: box.left,
        right: box.right,
        top: box.top + window.scrollY,
        bottom: box.bottom + window.scrollY,
        height: box.height,
      }
    }),
  )

// A press on a term opens that term. A term's press target reaches past its line, and on consecutive lines of a
// sentence the reach of one covered the term under it, so a tap on the lower part of "At 130 bpm" opened the range
// that sits beneath it. A real touch at the lower third of each term that has another term right under it, with the
// reach of the two overlapping in x, must open that one.
test('a tap on the lower third of a term opens it and not the term on the line below', async ({
  page,
}, testInfo) => {
  test.skip(
    !['mobile', 'mobile-webkit'].includes(testInfo.project.name),
    'A touch is made on the phone projects',
  )
  await openSample(page)
  await page.getByText('See the evidence').click()
  await expect(page.locator('.fitness-evidence .definition__term').first()).toBeVisible()
  let pairs = 0
  for (const scope of [
    '.fitness-card__headline',
    '.fitness-card__support',
    '.fitness-evidence',
    '.balance-hero__lede',
  ]) {
    const region = page.locator(scope)
    const boxes = await termBoxes(region)
    for (const upper of boxes) {
      // The term that starts on the next line, whose own box begins where this one's line ends.
      const lower = boxes.find(
        (other) =>
          other.index !== upper.index &&
          other.top >= upper.bottom - 2 &&
          other.top <= upper.bottom + 4 &&
          other.left < upper.right + 6 &&
          other.right > upper.left - 6,
      )
      if (lower === undefined) continue
      pairs += 1
      const terms = region.locator('.definition__term')
      await terms.nth(upper.index).scrollIntoViewIfNeeded()
      const now = (await termBoxes(region))[upper.index]!
      const viewportTop = await page.evaluate(() => window.scrollY)
      const x = (now.left + now.right) / 2
      const y = now.top - viewportTop + now.height * 0.85
      await page.touchscreen.tap(x, y)
      await expect(terms.nth(upper.index)).toHaveAttribute('aria-expanded', 'true')
      await expect(terms.nth(lower.index)).toHaveAttribute('aria-expanded', 'false')
      await page.keyboard.press('Escape')
      await expect(terms.nth(upper.index)).toHaveAttribute('aria-expanded', 'false')
    }
  }
  // The check is not vacuous: the card's sentence has terms on consecutive lines at a phone's width.
  expect(pairs).toBeGreaterThan(0)
})

test('the Run page leads with the same status above the threshold, and the Ride page says nothing about it', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Run')
  await expect(page.getByRole('region', { name: 'Your fitness' })).toBeVisible()
  await expect(card(page).locator('.fitness-card__state')).toHaveText('Slipping')
  // Above the threshold, and the sport is not named twice.
  const fitness = await edgesOf(card(page))
  const threshold = await edgesOf(page.getByRole('heading', { level: 2, name: /^Threshold pace/ }))
  expect(fitness.bottom).toBeLessThanOrEqual(threshold.top)
  await expect(card(page).locator('.fitness-card__sport')).toHaveCount(0)
  // The heading's own page title comes first.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Run')
  await goTo(page, 'Ride')
  await expect(page.getByRole('region', { name: 'Your fitness' })).toHaveCount(0)
})

test('the landing page’s example leads with the same finding for the sample athlete', async ({
  page,
}) => {
  await page.goto('/')
  const example = page.locator('.landing-example')
  await expect(example.locator('.landing-example__state')).toHaveText('Slipping')
  await expect(example.locator('.landing-example__sentence')).toHaveText(
    /^At 130 bpm you now run [\d.]+% \(\d+ to \d+%\) slower than before\.$/,
  )
  await expect(example.locator('.fitness-track__band')).toBeVisible()
})

test('a forced-colours reader still sees the card’s edge and the track’s outline', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Media emulation is checked on the desktop project',
  )
  await page.emulateMedia({ forcedColors: 'active' })
  await openSample(page)
  const edge = await card(page).evaluate((el) => getComputedStyle(el, '::before').backgroundColor)
  expect(edge).not.toBe('rgba(0, 0, 0, 0)')
  const bar = await card(page)
    .locator('.fitness-track__bar')
    .evaluate((el) => getComputedStyle(el).borderTopWidth)
  expect(bar).toBe('1px')
  // The band, which is a tint in colour, takes the system's highlight so the range is still a shape.
  const band = await card(page)
    .locator('.fitness-track__band')
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(band).not.toBe('rgba(0, 0, 0, 0)')
})

// The one thing in the evidence panel that moves is the phone's readout sheet, which opens with a short animation
// unless the reader asks for less motion. The check reads it both ways, so it cannot pass because nothing moves.
for (const [preference, animation] of [
  ['no-preference', 'chart-readout-open'],
  ['reduce', 'none'],
] as const) {
  test(`the chart's readout sheet animates for "${preference}" motion as ${animation}`, async ({
    page,
  }, testInfo) => {
    test.skip(
      !['mobile', 'mobile-webkit'].includes(testInfo.project.name),
      'The readout sheet is the phone’s',
    )
    await page.emulateMedia({ reducedMotion: preference })
    await openSample(page)
    await page.getByText('See the evidence').click()
    const chart = page.getByRole('figure', { name: CHART })
    await chart.locator('.plot-surface').focus()
    await page.keyboard.press('ArrowRight')
    const title = chart.locator('.chart-tooltip__title')
    await expect(title).toContainText(/^The \d+ weeks to /)
    const sheet = chart.locator('.chart-frame__readout--compact .chart-tooltip')
    expect(await sheet.evaluate((el) => getComputedStyle(el).animationName)).toBe(animation)
  })
}

// On a phone the level's labels sit inside the plot, where the reference line's label could land on one: no two of
// the chart's texts may share ground, whatever the width.
test('no label of the evidence chart is written over another', async ({ page }) => {
  await openSample(page)
  await page.getByText('See the evidence').click()
  const chart = page.getByRole('figure', { name: CHART })
  await expect(chart.locator('[data-annotation="before"]')).toBeVisible()
  const boxes = await chart.evaluate((root) => {
    const texts = [
      ...root.querySelectorAll(
        '.chart-y-axis__tick, .chart-x-axis__tick, [data-annotation] text, [data-testid="fitness-onset"] text',
      ),
    ]
    return texts
      .filter((t) => (t.textContent ?? '').trim() !== '')
      .map((t) => {
        const b = t.getBoundingClientRect()
        return {
          text: t.textContent ?? '',
          left: b.left,
          right: b.right,
          top: b.top,
          bottom: b.bottom,
        }
      })
  })
  expect(boxes.length).toBeGreaterThan(6)
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const apart =
        a.right <= b.left + 1 ||
        b.right <= a.left + 1 ||
        a.bottom <= b.top + 1 ||
        b.bottom <= a.top + 1
      // The level's labels are drawn twice (under the marks and over them), at the same place.
      const same = a.text === b.text && Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1
      expect(apart || same, `"${a.text}" and "${b.text}" overlap`).toBe(true)
    }
  }
})
