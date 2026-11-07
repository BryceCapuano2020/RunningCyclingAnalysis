import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { edgesOf, goTo, openSample, trackErrors } from './helpers.js'

const CARD = '.fitness-card[data-sport="run"]'
const CHART = /^Pace at \d+ bpm over time$/

/** A line's words as read, without the notes its defined terms keep in the markup. */
const spoken = (line: Locator) =>
  line.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement
    copy.querySelectorAll('.definition__note').forEach((note) => note.remove())
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
  })

/** The sample's run fitness row, on the page the test is on. */
const card = (page: Page) => page.locator(CARD)

/** Opens a fitness row's one Details, which holds the level, the basis, the track and the evidence. */
const openDetails = (row: Locator) => row.locator('.fitness-card__evidence > summary').click()

test('the sample’s Balance shows a fitness status that is new, with its one line and the runs behind it in Details', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)
  await expect(page.getByRole('region', { name: 'Your fitness' })).toBeVisible()
  await expect(card(page).locator('.fitness-card__state')).toHaveText('Run · Slipping')
  // One line under the title: the change, with no range.
  expect(await spoken(card(page).locator('.fitness-card__line'))).toMatch(
    /^\d+% off your (\d{4} level|level before \d{1,2} [A-Z][a-z]{2})\.$/,
  )
  // The rest waits in the row's Details: the level at its heart rate, the runs behind it, what is new and the track.
  await expect(card(page).locator('.fitness-card__headline')).toBeHidden()
  await openDetails(card(page))
  expect(await spoken(card(page).locator('.fitness-card__headline'))).toMatch(
    /^\d+:\d{2}\s\/(km|mi) at \d+ bpm\.$/,
  )
  expect(await spoken(card(page).locator('.fitness-card__support'))).toMatch(
    /^From \d+ steady runs, \d{1,2} [A-Z][a-z]{2} to \d{1,2} [A-Z][a-z]{2}\.$/,
  )
  await expect(card(page).getByTestId('fitness-season')).toHaveCount(0)
  await expect(page.getByTestId('fitness-new')).toHaveText(
    /^New since the week of \d{1,2} [A-Z][a-z]{2}\.$/,
  )
  // The change is a track, drawn and hidden from a screen reader, whose words are in the lines above it.
  await expect(card(page).locator('.fitness-track__bar')).toHaveAttribute('aria-hidden', 'true')
  await expect(card(page).locator('.fitness-track__ring')).toBeVisible()
  expect(errors).toEqual([])
})

test('the row’s Details open a chart with its table twin, the method, the limit once and the runs as links', async ({
  page,
}) => {
  await openSample(page)
  // Closed, the panel draws and measures nothing.
  await expect(page.getByRole('figure', { name: CHART })).toHaveCount(0)
  await openDetails(card(page))
  const chart = page.getByRole('figure', { name: CHART })
  await expect(chart).toBeVisible()
  // The chart: a ring and a range for each four-week step, the line it is read against, the month it began, and now.
  expect(await chart.locator('[data-testid="fitness-point"]').count()).toBeGreaterThanOrEqual(5)
  await expect(chart.locator('[data-testid="fitness-now"]')).toHaveCount(1)
  await expect(chart.locator('[data-annotation="before"]')).toContainText(/^Before /)
  await expect(chart.locator('[data-testid="fitness-onset"]')).toContainText(/^Began /)
  // Its table twin has a row for each step.
  const steps = await chart.locator('[data-testid="fitness-point"]').count()
  await chart
    .locator('details.chart-frame__details > summary', { hasText: 'View as table' })
    .click()
  await expect(chart.locator('table').nth(1).locator('tbody tr')).toHaveCount(steps + 1)
  // The method and the honest limit, said once; and why some runs do not count.
  const panel = page.locator('.fitness-evidence')
  await expect(panel.getByRole('heading', { name: 'How it is measured' })).toBeVisible()
  await expect(panel).toContainText('A change of 8% it sees within weeks, reliably.')
  await expect(panel).toContainText(
    'A change of 5% it usually sees within a few months, and not always.',
  )
  expect(await panel.getByText(/it usually sees within a few months/).count()).toBe(1)
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
  const summary = card(page).locator('.fitness-card__evidence > summary')
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
  // The row's one line carries no range, so the range is the one the evidence names; the third term is the one in how
  // the figure is measured, which every phone has.
  await openDetails(card(page))
  const terms: [Locator, RegExp][] = [
    [card(page).getByRole('button', { name: /^at \d+ bpm$/ }), /one heart rate, \d+ bpm/],
    [card(page).getByRole('button', { name: '90% range', exact: true }), /nine times out of ten/],
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
  // At 412 px both engines set the evidence's "steady run" over "120 bpm", their reaches overlapping in x; at 390 WebKit
  // breaks the line so the two no longer overlap, and the check would have no pair to try.
  await page.setViewportSize({ width: 412, height: 800 })
  await openSample(page)
  await openDetails(card(page))
  await expect(page.locator('.fitness-evidence .definition__term').first()).toBeVisible()
  let pairs = 0
  for (const scope of [
    `${CARD} .fitness-card__headline`,
    `${CARD} [data-testid="fitness-change"]`,
    `${CARD} .fitness-card__support`,
    '.fitness-evidence',
  ]) {
    const region = page.locator(scope)
    // A status with one change has no second change line in its Details.
    if ((await region.count()) === 0) continue
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

test('the Run page puts the same status directly under the threshold hero', async ({ page }) => {
  await openSample(page)
  await goTo(page, 'Run')
  await expect(page.getByRole('region', { name: 'Your fitness' })).toBeVisible()
  await expect(card(page).locator('.fitness-card__state')).toHaveText('Slipping')
  // Under the hero, and the sport is not named twice: the row's title is the state alone (exact text above).
  const fitness = await edgesOf(card(page))
  const hero = await edgesOf(page.locator('.sport-hero'))
  expect(hero.bottom).toBeLessThanOrEqual(fitness.top)
  await expect(page.getByTestId('hero-threshold')).toBeVisible()
  // The heading's own page title comes first.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Run')
})

// The sample is a runner who took up riding this autumn, so it has too few steady rides from before the last 8 weeks to call a
// trend (see FitnessCard.test.tsx): home gives the ride a row titled by the sport alone with its level as the one line, its
// figures spaced and no link, and the Ride page holds the ride's own row, with the level, what a trend needs and no run on it.
test('Balance tells a ride that cannot call a trend as one line, and the Ride page holds its row', async ({
  page,
}) => {
  await openSample(page)
  await expect(page.locator('.fitness-card')).toHaveCount(2)
  const home = page.locator('.fitness-card[data-sport="ride"]')
  await expect(home.locator('.fitness-card__state')).toHaveText('Ride')
  const line = home.locator('.fitness-card__line')
  // The words as the eye reads them, so a collapsed space around a figure fails here.
  expect(await line.evaluate((el) => (el as HTMLElement).innerText)).toMatch(/^\d+ W at \d+ bpm\.$/)
  await expect(line.getByRole('link')).toHaveCount(0)
  await goTo(page, 'Ride')
  const ride = page.locator('.fitness-card[data-sport="ride"]')
  await expect(page.getByRole('region', { name: 'Your fitness' })).toBeVisible()
  await expect(ride).toHaveCount(1)
  await expect(ride.locator('.fitness-card__state')).toHaveText('No trend yet')
  await openDetails(ride)
  expect(await spoken(ride.locator('.fitness-card__headline'))).toMatch(
    /^\d+ W \(\d+ to \d+\) at \d+ bpm\.$/,
  )
  await expect(ride.getByTestId('fitness-needs')).toHaveText(
    /^\d+ more earlier rides? to see a trend\.$/,
  )
  await expect(page.locator('.fitness-card[data-sport="run"]')).toHaveCount(0)
})

test('the landing page’s one sample card holds the finding under the balance, with no size to differ from the sample’s', async ({
  page,
}) => {
  await page.goto('/')
  const example = page.locator('.landing-example')
  await expect(example).toHaveCount(1)
  await expect(example.locator('figcaption .landing-example__name')).toHaveText('Sample athlete')
  await expect(example.locator('.landing-example__state')).toHaveText('Slipping')
  await expect(example.locator('.landing-example__sentence')).toHaveText(
    /^Slower than your old level at 120 bpm\.$/,
  )
  await expect(example.locator('.fitness-track__ring')).toBeVisible()
  // The balance comes first; the finding is under it, in the same card.
  const levels = await edgesOf(example.locator('.balance-levels'))
  const panel = await edgesOf(example.locator('.landing-example__fitness'))
  expect(levels.bottom).toBeLessThanOrEqual(panel.top)
  const frame = await edgesOf(example)
  expect(panel.bottom).toBeLessThanOrEqual(frame.bottom)
  // The sample's own Balance page says the same state at the same heart rate.
  await openSample(page)
  await expect(card(page).locator('.fitness-card__state')).toHaveText('Run · Slipping')
  await openDetails(card(page))
  expect(await spoken(card(page).locator('.fitness-card__headline'))).toMatch(/ at 120 bpm\.$/)
})

test('a forced-colours reader still sees the row’s hairline, the track’s line and its mark', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Media emulation is checked on the desktop project',
  )
  await page.emulateMedia({ forcedColors: 'active' })
  await openSample(page)
  const edge = await card(page).evaluate((el) => {
    const style = getComputedStyle(el)
    return { width: style.borderTopWidth, style: style.borderTopStyle }
  })
  expect(edge).toEqual({ width: '1px', style: 'solid' })
  await openDetails(card(page))
  // The track's line and its mark are fills in colour; they take the system's text colour, so both are still drawn.
  const line = await card(page)
    .locator('.fitness-track__bar')
    .evaluate((el) => getComputedStyle(el, '::before').backgroundColor)
  expect(line).not.toBe('rgba(0, 0, 0, 0)')
  const mark = await card(page)
    .locator('.fitness-track__ring')
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(mark).not.toBe('rgba(0, 0, 0, 0)')
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
    await openDetails(card(page))
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
  await openDetails(card(page))
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

// The row's title grows with the text size. At 200% text on a phone every state, not only the sample's, must stay inside
// the row (Slipping overflowed by 36 px at 390 once).
for (const width of [320, 390]) {
  test(`every fitness state word fits the card at 200% text and ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openSample(page)
    await page.addStyleTag({ content: ':root { font-size: 200%; }' })
    const labels = ['Slipping', 'Holding', 'Holding below', 'Recovering', 'Back']
    const over = await card(page).evaluate((el, words) => {
      const state = el.querySelector('.fitness-card__state')!
      const style = getComputedStyle(el)
      const inner =
        el.getBoundingClientRect().right -
        parseFloat(style.paddingRight) -
        parseFloat(style.borderRightWidth)
      return words.map((word) => {
        state.textContent = `Run · ${word}`
        const range = document.createRange()
        range.selectNodeContents(state)
        return { word, over: Math.round(range.getBoundingClientRect().right - inner) }
      })
    }, labels)
    expect(over.filter(({ over: past }) => past > 0)).toEqual([])
  })
}
