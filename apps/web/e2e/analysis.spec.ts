import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { SAMPLE_TEXT, rowPattern } from './sampleText.js'
import {
  BALANCE_TITLE,
  LANDING_TITLE,
  LIST_PAGE_SIZE,
  SAMPLE_BANNER,
  activitiesRows,
  edgesOf,
  firstScreenFoot,
  goTo,
  openSample,
  trackErrors,
  uploadFixtures,
  openMethod,
} from './helpers.js'

/**
 * The Balance page's last chart: the hours trained each week, found by its title.
 */
const BEST_EFFORTS_CURVE = 'Best effort by duration'

test('a sample athlete shows the balance, its charts, the activities and the sample notice', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect(page.getByRole('status').filter({ hasText: SAMPLE_BANNER })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Level in each sport' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: SAMPLE_BANNER })).toHaveCount(1)

  // The sample's season is long enough to draw each sport's best efforts curve. No jump list stands over the sections.
  for (const sport of ['Run', 'Ride'] as const) {
    await goTo(page, sport)
    await expect(page.getByRole('figure', { name: BEST_EFFORTS_CURVE, exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Time in zones' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'On this page' })).toHaveCount(0)
  }

  await goTo(page, 'Balance')
  await openMethod(page)
  // Method keeps its words and constants, with no chart in any of its sections.
  await expect(page.getByRole('region', { name: 'The energy view' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Heart-rate check' })).toBeVisible()
  await expect(page.locator('.method').getByRole('figure')).toHaveCount(0)

  // The sample's season is longer than one page of the list.
  await expect(await activitiesRows(page)).toHaveCount(LIST_PAGE_SIZE)
  expect(errors).toEqual([])
})

test('the ride as a run tile names the ride threshold behind its pace and opens to every duration', async ({
  page,
  isMobile,
}) => {
  await openSample(page)

  const card = page.getByRole('article', { name: 'Your ride as a run' })
  await expect(card.getByRole('link')).toHaveCount(0)

  // The threshold the pace rests on is inside the tile's one fold, not a line under its title.
  const details = card.locator('details')
  await expect(details).not.toHaveAttribute('open')
  const basis = card.locator('.props__row', { hasText: /^From your threshold/ }).locator('dd')
  await expect(basis).toBeHidden()
  await details.locator('summary').click()
  await expect(basis).toHaveText(/^\d+ W$/)
  await expect(basis).toBeVisible()
  // A phone shows the efforts as a list, and a wider screen as a table.
  const rideEffort = isMobile
    ? details.getByRole('term').filter({ hasText: 'Ride effort' }).first()
    : details.getByRole('columnheader', { name: 'Ride effort' })
  await expect(rideEffort).toBeVisible()
})

test('Balance says the lean once: no lean tile, three tiles at most, and the level target in the answer’s Details', async ({
  page,
}) => {
  await openSample(page)

  await expect(page.getByRole('article', { name: 'Lean' })).toHaveCount(0)
  const tiles = page.locator('.balance-tiles')
  await expect(tiles.getByRole('article')).toHaveCount(3)
  await expect(tiles).not.toContainText(/\bpts\b/)
  // The grades are the triangle's corners, once each; the target is a line of the hero, not of a tile.
  await expect(page.locator('.level-triangle__corner')).toHaveCount(3)
  await expect(page.locator('.balance-meter')).toHaveCount(0)
  // The target is the answer's Details, one press down, not a line under the lede.
  const target = page.locator('.balance-hero .props__row', { hasText: /^To match it on the / })
  await expect(target).toHaveCount(1)
  await expect(target).toBeHidden()
  await page.locator('.balance-hero .page-details > summary').click()
  await expect(target).toBeVisible()
  await expect(target.locator('dd')).toHaveText(/^\d+ W( \(\d+\u2013\d+\))?$|^\d+:\d{2} \/(km|mi)$/)
  await expect(tiles.getByText(/^To match it/)).toHaveCount(0)
  // No tile figure is as large as the headline.
  const headline = await page.getByRole('heading', { level: 1 }).evaluate((el) => {
    return parseFloat(getComputedStyle(el).fontSize)
  })
  for (const figure of await tiles.locator('.stat-tile__number').all()) {
    const size = await figure.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(size).toBeLessThanOrEqual(48)
    expect(size).toBeLessThanOrEqual(headline)
  }
})

test('uploading the Strava export zip shows the results, including its GPX run', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['sample-export.zip'])

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/leans toward running/)
  // Fourteen FIT activities and one GPX run.
  await expect(await activitiesRows(page)).toHaveCount(15)
  await expect(page.getByText(/^[\d,]+ files?: /)).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: SAMPLE_BANNER })).toHaveCount(0)
})

test('uploading a GPX ride and a TCX run shows the results', async ({ page }) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-ride.gpx', 'one-run.tcx'])

  // The 12 min run has no 20 min effort or threshold to set against the ride, so the balance is held.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Not enough to compare yet')
  await expect(page.getByText(/^From 1 run and 1 ride\./)).toBeVisible()
  await expect(page.getByRole('article', { name: 'Run threshold' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Ride threshold' })).toBeVisible()
  await expect(await activitiesRows(page)).toHaveCount(2)
  await expect(page.getByText(/^[\d,]+ files?: /)).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toHaveCount(0)
})

test("uploading a single run is the running's own page, invites a ride at the foot and keeps the run tile", async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-run.fit'])

  const heading = page.getByRole('heading', { level: 1, name: 'Your running so far' })
  await expect(heading).toBeVisible()
  // The headline is never a request; the ask is one row at the foot.
  await expect(heading).not.toHaveText(/Add a (run|ride)/)
  await expect(page.getByTestId('sport-invitation')).toContainText(
    'Add rides to compare them with your running.',
  )
  const run = page.getByRole('article', { name: 'Run threshold' })
  await expect(run).toBeVisible()
  // The name says the threshold is an estimate, so the tile carries no chip and no range shape; the runs it rests on
  // and how it was worked out are one tap down, with no line under the figure.
  await expect(run.locator('.stat-tile__number')).toBeVisible()
  await expect(run.locator('.props__row', { hasText: /^Runs used/ })).toBeHidden()
  await expect(run.getByText(/Estimated|At least/)).toHaveCount(0)
  await expect(run.locator('.stat-tile__effort')).toHaveCount(0)
  await run.locator('summary', { hasText: 'How this was worked out for threshold pace' }).click()
  const panel = run.locator('.props')
  await expect(panel.locator('.props__row', { hasText: /^Runs used/ }).locator('dd')).toHaveText(
    '1',
  )
  await expect(
    panel.locator('.props__row', { hasText: /^Strongest effort/ }).locator('dd'),
  ).toHaveText(/^\d+ min, [^.]+$/)
  await expect(panel.locator('.props__row', { hasText: /^Range/ }).locator('dd')).toHaveText(
    /^\d+:\d{2}\u2013\d+:\d{2} \/(km|mi)$/,
  )
  await expect(panel.getByRole('link', { name: 'Method' })).toBeVisible()
  await expect(panel).not.toContainText(/heart rate/i)
})

test('a one-sport library never gets a request for a headline, whichever sport it holds', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-ride.gpx'])

  const heading = page.getByRole('heading', { level: 1 })
  await expect(heading).toHaveText(BALANCE_TITLE)
  await expect(heading).not.toHaveText(/Add a (run|ride)/)
  await expect(page.getByTestId('sport-invitation')).toContainText(
    'Add runs to compare them with your cycling.',
  )
  // No empty card for the other sport, and no cross-sport tile.
  await expect(page.getByRole('region', { name: 'Run' })).toHaveCount(0)
})

test('uploading a file that is not FIT lists it as unusable and keeps the landing page', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['not-a-fit.fit'])

  // The summary is one line. Its list is made when it opens, and names the file once.
  const line = page.getByText('1 file needs a look', { exact: true })
  await expect(line).toBeVisible()
  await expect(page.getByText(/not-a-fit\.fit/)).toHaveCount(0)
  await line.click()
  await expect(page.getByText('1 file: 1 needs a look.', { exact: true })).toBeVisible()
  await expect(page.getByText('Need a look: 1 file')).toBeVisible()
  await expect(page.getByText(/not-a-fit\.fit/)).toHaveCount(1)
  await expect(page.getByText(/not-a-fit\.fit/)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
})

test('a chart plot responds to the arrow keys with a tooltip', async ({ page }) => {
  await openSample(page)
  await goTo(page, 'Run')

  const plot = page.locator('[aria-roledescription="chart"]').first()
  await plot.focus()
  await page.keyboard.press('ArrowRight')

  // The plot is described by its tooltip and its arrow-key hint. The toolbar has its own status region,
  // so the tooltip is found by its id, and the hint must resolve to an element of its own.
  const described = ((await plot.getAttribute('aria-describedby')) ?? '').split(' ')
  const tooltipId = described.find((id) => id.endsWith('-tooltip'))
  const hintId = described.find((id) => id.endsWith('-hint'))
  expect(tooltipId).toBeTruthy()
  expect(hintId).toBeTruthy()
  await expect(page.locator(`[id="${tooltipId}"]`)).toBeVisible()
  await expect(page.locator(`[id="${hintId}"]`)).toHaveCount(1)
})

test('removing all activities on the Profile page clears the sample and returns to the landing page', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Profile')
  // The sample is never kept, so with nothing kept the trigger clears the analysis on screen.
  await page.getByRole('button', { name: 'Clear the analysis' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear', exact: true }).click()

  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  // The app moves to the landing page's hash only once the result has been cleared.
  await expect(page).toHaveURL(/#\/$/)
  await expect(
    page.getByText('Add FIT, GPX or TCX files, or a Strava or Garmin export zip'),
  ).toBeVisible()
})

/** The level triangle's plot and its three corners, which say each sport's grade and level. */
const PLOT = '.level-triangle__plot'
const CORNERS = '.level-triangle__corner'
/** The parts of a corner, which stay inside the window. */
const CORNER_PARTS = [
  '.level-triangle__label',
  '.level-triangle__figure',
  '.level-triangle__level',
  '.level-triangle__none',
]

/** The run's fitness row: its title (the sport and its state), its one line, and the Details that hold the rest. */
const FITNESS_CARD = '.fitness-card[data-sport="run"]'
const FITNESS_STATE = `${FITNESS_CARD} .fitness-card__state`
const FITNESS_LINE = `${FITNESS_CARD} .fitness-card__line`
const FITNESS_DETAILS = `${FITNESS_CARD} details.fitness-card__evidence`

// The balance leads the home page: at 1440 by 900 its headline, triangle and corners are on the first screen, and the
// fitness card sits under the tiles, whole, with its track beside the words.
test('at 1440 by 900 the balance leads the first screen, and the fitness card sits under its tiles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openSample(page)
  const headline = await edgesOf(page.getByRole('heading', { level: 1 }))
  const plot = await edgesOf(page.locator(PLOT))
  const corners = await edgesOf(page.locator(CORNERS).last())
  expect(headline.bottom).toBeLessThan(plot.top)
  expect(corners.bottom).toBeLessThanOrEqual(900)
  // The card comes after the tiles and before the grade by duration.
  const tiles = await edgesOf(page.locator('.balance-tiles'))
  const card = await edgesOf(page.locator(FITNESS_CARD))
  const grades = await edgesOf(page.getByRole('region', { name: 'Age grade by effort length' }))
  expect(card.top).toBeGreaterThanOrEqual(tiles.bottom)
  expect(card.bottom).toBeLessThanOrEqual(grades.top)
  await page.locator(FITNESS_CARD).scrollIntoViewIfNeeded()
  await expect(page.locator(FITNESS_STATE)).toHaveText('Run · Slipping')
  // One line under the title, a figure with no range; the level with its range, what is new and the track are behind
  // the row's Details, inside the row, under its line.
  await expect(page.locator(FITNESS_LINE)).toHaveText(/^\S.*\.$/)
  await expect(page.locator(FITNESS_LINE)).not.toHaveText(/\(\S+ to \S+\)/)
  const fresh = page.locator(`${FITNESS_CARD} .props__row`, { hasText: /^New since/ })
  await expect(fresh).toBeHidden()
  await page.locator(`${FITNESS_DETAILS} > summary`).click()
  await expect(fresh.locator('dd')).toContainText('the week of')
  const trackEdges = await edgesOf(page.locator(`${FITNESS_CARD} .fitness-track`))
  const lineEdges = await edgesOf(page.locator(FITNESS_LINE))
  const cardBox = (await page.locator(FITNESS_CARD).boundingBox())!
  const trackBox = (await page.locator(`${FITNESS_CARD} .fitness-track`).boundingBox())!
  expect(trackEdges.top).toBeGreaterThanOrEqual(lineEdges.bottom)
  expect(trackBox.x + trackBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)
  expect(trackEdges.bottom).toBeLessThanOrEqual((await edgesOf(page.locator(FITNESS_CARD))).bottom)
  // The triangle is the first drawing on the page, and the card's track comes after it.
  const order = await page.evaluate(() => {
    const track = document.querySelector('.fitness-card[data-sport="run"] .fitness-track__bar')
    const first = document.querySelector('main svg:not(.icon)')
    return {
      trackAfter:
        track !== null &&
        first !== null &&
        (first.compareDocumentPosition(track) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      first: first?.getAttribute('class') ?? '',
    }
  })
  expect(order.trackAfter).toBe(true)
  expect(order.first).toContain('level-triangle__plot')
  // The corners say the sample's own levels, with no meter and no ladder.
  await expect(page.locator(CORNERS).nth(0)).toContainText(rowPattern(SAMPLE_TEXT.rows[0]!))
  await expect(page.locator(CORNERS).nth(1)).toContainText(rowPattern(SAMPLE_TEXT.rows[1]!))
  await expect(page.locator('.balance-hero__pair .level-triangle')).toHaveCount(1)
  await expect(page.locator('.balance-meter, .balance-levels')).toHaveCount(0)
})

// A phone opens on the balance, the sample notice and all: at 390 by 844 and at 320 by 640 the headline and the
// triangle end on the first screen, under the header and the rail, and the fitness row follows the tiles.
for (const [width, height] of [
  [390, 844],
  [320, 640],
] as const) {
  test(`at ${width} by ${height} the balance headline and triangle are on the first screen, and the fitness row follows the tiles`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await openSample(page)
    await expect(page.getByText('Sample athlete', { exact: false }).first()).toBeVisible()
    const foot = await firstScreenFoot(page)
    const headline = await edgesOf(page.getByRole('heading', { level: 1 }))
    const plot = await edgesOf(page.locator(PLOT))
    expect(headline.bottom).toBeLessThan(plot.top)
    // The vertices are on the first screen; the two lower corners hang under them, so the first screen holds the plot.
    expect(plot.top).toBeLessThanOrEqual(foot)
    const top = await edgesOf(page.locator(CORNERS).first())
    expect(top.bottom).toBeLessThanOrEqual(foot)
    // The period is the rail's, above the title; the three corners follow, run at the top, then the two below it.
    const period = await edgesOf(page.getByRole('group', { name: 'Period' }))
    expect(period.bottom).toBeLessThanOrEqual(headline.top)
    const corners = await page.locator(CORNERS).all()
    expect(corners).toHaveLength(3)
    const [run, ride, lift] = await Promise.all(corners.map((corner) => corner.boundingBox()))
    if (!run || !ride || !lift) throw new Error('no box for a corner')
    expect(ride.y).toBeGreaterThan(run.y + run.height)
    expect(lift.y).toBeGreaterThan(run.y + run.height)
    expect(lift.x + lift.width).toBeLessThanOrEqual(ride.x + 1)
    // The row is under the tiles, and its title, its line and, once opened, its track follow one another.
    await page.locator(`${FITNESS_DETAILS} > summary`).click()
    const tiles = await edgesOf(page.locator('.balance-tiles'))
    const card = await edgesOf(page.locator(FITNESS_CARD))
    const state = await edgesOf(page.locator(FITNESS_STATE))
    const sentence = await edgesOf(page.locator(FITNESS_LINE))
    const track = await edgesOf(page.locator(`${FITNESS_CARD} .fitness-track`))
    expect(card.top).toBeGreaterThanOrEqual(tiles.bottom)
    expect(sentence.top).toBeGreaterThanOrEqual(state.bottom)
    expect(track.top).toBeGreaterThanOrEqual(sentence.bottom)
    expect(track.bottom).toBeLessThanOrEqual(card.bottom)
    // Nothing collides, and the page does not scroll sideways.
    for (const selector of [
      FITNESS_CARD,
      `${FITNESS_CARD} .fitness-track__ends`,
      FITNESS_LINE,
      `${FITNESS_CARD} .props`,
      ...CORNER_PARTS,
    ]) {
      const box = await page.locator(selector).first().boundingBox()
      expect(box === null ? -1 : box.x).toBeGreaterThanOrEqual(0)
      expect(box === null ? width + 1 : box.x + box.width).toBeLessThanOrEqual(width)
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0)
  })
}

// On a wide screen the headline runs the answer's full width, the lede keeps the prose measure, and the triangle is
// centred on the tiles' column at 440 px at most.
test('at 1280 the headline runs the full width, the lede keeps its measure, and the triangle is centred on the tiles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openSample(page)
  const headline = await page.getByRole('heading', { level: 1 }).boundingBox()
  const lede = await page.locator('.balance-hero__lede').boundingBox()
  const tiles = await page.locator('.balance-tiles').boundingBox()
  const triangle = await page.locator('.level-triangle').boundingBox()
  if (headline === null || lede === null || tiles === null || triangle === null) {
    throw new Error('no box for the headline, lede, tiles or triangle')
  }
  // The lede keeps the prose measure (--measure, 36rem), which a probe of that width measures.
  const measure = await page.locator('.balance-hero__lede').evaluate((el) => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--measure)'
    el.parentElement!.appendChild(probe)
    const width = probe.getBoundingClientRect().width
    probe.remove()
    return width
  })
  expect(measure).toBeGreaterThan(400)
  expect(headline.width).toBeGreaterThan(lede.width)
  expect(lede.width).toBeLessThanOrEqual(measure + 1)
  expect(triangle.y).toBeGreaterThanOrEqual(lede.y + lede.height)
  expect(triangle.width).toBeLessThanOrEqual(441)
  expect(triangle.x + triangle.width / 2).toBeCloseTo(tiles.x + tiles.width / 2, 0)
})

// A landscape phone has too little height for the triangle and a card: the balance's headline is what is on screen.
test('at 667 by 375 the balance headline is on the first screen', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 })
  await openSample(page)
  const foot = await firstScreenFoot(page)
  expect((await edgesOf(page.getByRole('heading', { level: 1 }))).bottom).toBeLessThanOrEqual(foot)
})

test('the corners are plain text in links, and the bands are on Method', async ({ page }) => {
  await openSample(page)
  // A corner is a link to its sport's page; nothing inside it is a control or a defined term.
  await expect(page.locator(CORNERS).first().getByRole('button')).toHaveCount(0)
  await expect(page.locator(`${CORNERS} .definition__term`)).toHaveCount(0)
  await expect(page.getByRole('link', { name: /^Running \d+% \w+/ })).toHaveAttribute(
    'href',
    '#/run',
  )
  await expect(page.getByRole('link', { name: /^Cycling \d+% \w+/ })).toHaveAttribute(
    'href',
    '#/ride',
  )
  // The answer's Details carry the ranges, and no prose on what a level is: Method lists the bands.
  await expect(page.locator('.balance__levels-meaning')).toHaveCount(0)
  await page.locator('.balance-hero .page-details > summary').click()
  await expect(page.locator('.balance-hero .page-details')).toContainText(/Range, 90%/)
  await expect(page.locator('.balance-hero .page-details')).not.toContainText(
    /A band of the age grade/,
  )
  await page.locator('.balance-hero .props__method').click()
  await expect(page.getByRole('main')).toContainText(/Club is 50% to 59%/)
})

test('the corners are named in words and are text, none under the meta size', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await openSample(page)
  await expect(page.locator(CORNERS).nth(0)).toContainText(rowPattern(SAMPLE_TEXT.rows[0]!))
  await expect(page.locator(CORNERS).nth(1)).toContainText(rowPattern(SAMPLE_TEXT.rows[1]!))
  await expect(page.getByRole('link', { name: /^Running \d+% \w+/ })).toBeVisible()
  const sizes = await page
    .locator(`${CORNERS} > *:not(.sr-only)`)
    .evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)))
  expect(sizes.length).toBeGreaterThan(6)
  // The smallest step of the type scale is --text-meta, 11 px (docs/design/system.md, Type): nothing is set under it.
  const meta = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.fontSize = 'var(--text-meta)'
    document.body.append(probe)
    const px = parseFloat(getComputedStyle(probe).fontSize)
    probe.remove()
    return px
  })
  expect(meta).toBe(11)
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(meta)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0)
})

// On a phone a defined term's note is a sheet at the window's foot. It is fixed to the window, so no box around a
// term may be transformed, filtered or contained, or the sheet would be squeezed into that box (it was, once, into a
// 90 px column over the headline).
for (const [width, height] of [
  [390, 844],
  [320, 640],
] as const) {
  test(`at ${width} by ${height} a defined term's note is a sheet at the window's foot`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    // Method defines its terms in place; the landing example no longer defines any (its triangle has no range).
    await page.goto('/#/method')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const terms = [page.locator('.definition button').first()]
    for (const term of terms) {
      await term.focus()
      await page.keyboard.press('Enter')
      await expect(term).toHaveAttribute('aria-expanded', 'true')
      const id = await term.getAttribute('aria-controls')
      const box = await page.locator(`[id="${id}"]`).boundingBox()
      if (box === null) throw new Error('the note has no box')
      expect(box.width).toBeGreaterThanOrEqual(width - 1)
      expect(box.x).toBeLessThanOrEqual(1)
      expect(box.y + box.height).toBeGreaterThanOrEqual(height - 1)
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1)
      expect(box.height).toBeLessThan(height / 2)
      // The note's words wrap inside it, whatever line the term sits in: none runs past its right edge.
      expect(
        await page.locator(`[id="${id}"]`).evaluate((note) => note.scrollWidth - note.clientWidth),
      ).toBeLessThanOrEqual(0)
      await page.keyboard.press('Escape')
      await expect(term).toHaveAttribute('aria-expanded', 'false')
    }
  })
}

/**
 * Every defined term on the page, and every box around one that is transformed, filtered, contained or promoted:
 * any of them would trap the phone's fixed note sheet.
 */
function definedTermAncestors(page: Page): Promise<{ terms: number; bad: string[] }> {
  return page.evaluate(() => {
    const bad: string[] = []
    const terms = document.querySelectorAll('.definition')
    for (const term of terms) {
      for (let node = term.parentElement; node !== null; node = node.parentElement) {
        const style = getComputedStyle(node)
        const risky = [
          ['transform', style.transform, 'none'],
          ['filter', style.filter, 'none'],
          ['backdrop-filter', style.backdropFilter, 'none'],
          ['perspective', style.perspective, 'none'],
          ['contain', style.contain, 'none'],
          ['container-type', style.containerType, 'normal'],
          [
            'will-change',
            /transform|filter|perspective/.test(style.willChange) ? style.willChange : 'auto',
            'auto',
          ],
        ].filter(([, value, fine]) => value !== fine)
        for (const [name, value] of risky) bad.push(`${node.className} ${name}: ${value}`)
      }
    }
    return { terms: terms.length, bad }
  })
}

test('no box around a defined term is transformed, filtered or contained, on the landing page, Method, Balance or a sport page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  // The landing example defines no term now (its triangle has no range), so its boxes cannot trap a note; Method defines its own.
  await page.goto('/')
  await expect(page.locator('.landing-example .level-triangle')).toBeVisible()
  await expect(page.locator('.landing-example .definition')).toHaveCount(0)
  const landing = await definedTermAncestors(page)
  expect(landing.bad).toEqual([])
  await page.goto('/#/method')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const method = await definedTermAncestors(page)
  expect(method.terms).toBeGreaterThanOrEqual(1)
  expect(method.bad).toEqual([])
  await openSample(page)
  // Balance's hero has no defined term of its own now (the corners are links), so only the boxes are checked.
  const balance = await definedTermAncestors(page)
  expect(balance.bad).toEqual([])
  for (const sport of ['Run', 'Ride'] as const) {
    await goTo(page, sport)
    const found = await definedTermAncestors(page)
    expect(found.bad, sport).toEqual([])
  }
})

// The landing example draws the level triangle: run and ride graded, lifting with no grade yet. Its three corners stay whole
// inside the window at a phone's width and a desktop's, and the page does not scroll sideways.
for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [320, 640],
] as const) {
  test(`at ${width} the landing example's triangle and its corners stay inside the window`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    const figure = page.locator('.landing-example .level-triangle')
    await expect(figure).toBeVisible()
    const corners = figure.locator('.level-triangle__corner')
    await expect(corners).toHaveCount(3)
    await expect(corners.nth(0)).toContainText(rowPattern(SAMPLE_TEXT.rows[0]!))
    await expect(corners.nth(1)).toContainText(rowPattern(SAMPLE_TEXT.rows[1]!))
    await expect(corners.nth(2)).toContainText('Lifting')
    await expect(corners.nth(2)).toContainText('No grade yet')
    // The example is a picture of the sample, so its corners lead nowhere, and the old meter and levels are gone.
    await expect(figure.locator('a')).toHaveCount(0)
    await expect(
      page.locator('.landing-example .balance-meter, .landing-example .balance-levels'),
    ).toHaveCount(0)
    for (const box of await corners.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().toJSON() as { left: number; right: number }),
    )) {
      expect(box.left).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(width)
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0)
  })
}
