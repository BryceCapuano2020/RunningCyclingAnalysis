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
  goTo,
  openSample,
  trackErrors,
  uploadFixtures,
} from './helpers.js'

/**
 * The charts by their figure titles. Balance's meter is named by the balance's own sentence, in points when both
 * sports are graded and in percent of energy while the grades are missing.
 */
const BALANCE_METER =
  /^(Running|Cycling) (grades \d+ points? higher|\d+% higher)|^In balance: |^Even within the model's range/
/**
 * The Balance page's last chart: the hours trained each week. Its title says what it found, so it is found by the
 * name under it.
 */
const BALANCE_HOURS = /Training hours per week/
const RUN_CURVE = /^Run flat pace per (kilometre|mile) by duration$/
const RIDE_CURVE = /^Ride power in watts by duration$/
/** The sport page's section of dated bests, which needs a season of activities. */
const OPEN_SEASON_SECTION = 'Best efforts over time'
/** The sections that need a season: each row says its finding, and the section is open to its chart. */
/** The same-heart-rate row is the weekly view: it says what is drawn and claims no change. */
const SEASON_SECTIONS = ['Same heart rate, week by week', 'Durability']
/** The section of the finding that compares each best with the athlete's other bests. */
const STAND_OUT_SECTION = 'Best durations'
const STANDS_OUT_LINE =
  /^(?:Your (?:all-time )?bests are in line with each other|Nothing stands out|.*stand out)/
const ENERGY_SCALE = /^Run and Ride energy rate \(metabolic W\/kg\) by duration$/
const RATIO = /^Run compared with Ride by duration$/
const HEART_RATE = /^Heart rate against energy rate$/
const POWER_ACCURACY = /^Estimated against measured power on climbs$/

/** Opens one section's "Show the evidence" disclosure on How sure is this?, so its chart is shown. */
async function showEvidence(page: Page, section: string): Promise<void> {
  await page.locator('summary', { hasText: `Show the evidence for the ${section}` }).click()
}

test('a sample athlete shows the balance, its charts, the activities and the sample notice', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect(page.getByRole('status').filter({ hasText: SAMPLE_BANNER })).toBeVisible()
  await expect(page.getByRole('img', { name: BALANCE_METER })).toBeVisible()
  await expect(page.locator('figure').filter({ hasText: BALANCE_HOURS })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: SAMPLE_BANNER })).toHaveCount(1)

  // The sample's season is long and varied enough to fill every section of a sport page: stand-out, best efforts over
  // time, same heart rate, durability. Every long session counts toward a late best, so durability has both its charts.
  for (const sport of ['Run', 'Ride'] as const) {
    await goTo(page, sport)
    await expect(
      page.getByRole('figure', { name: sport === 'Run' ? RUN_CURVE : RIDE_CURVE }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: OPEN_SEASON_SECTION })).toBeVisible()
    // The dated bests are drawn: a figure named for the effort, with at least two dots in its plot.
    const dated = page.locator('section').filter({
      has: page.getByRole('heading', { level: 2, name: OPEN_SEASON_SECTION }),
    })
    await expect(dated.getByRole('figure', { name: /20 min/ })).toBeVisible()
    expect(await dated.locator('[data-testid^="bests-"]').count()).toBeGreaterThanOrEqual(2)
    // A section with content is open to start with, and its row says what it found.
    const standOut = page.getByRole('region', { name: STAND_OUT_SECTION })
    await expect(standOut.locator('.sport-disclosure__finding')).toHaveText(STANDS_OUT_LINE)
    for (const section of SEASON_SECTIONS) {
      const region = page.getByRole('region', { name: section })
      await expect(region.locator('.sport-disclosure__details')).toHaveAttribute('open', '')
      await expect(region.getByRole('figure').first()).toBeVisible()
    }
    // The finding on a row that the section's charts already say is left off while it is open, and a fold brings it back.
    const durability = page.getByRole('region', { name: 'Durability' })
    await expect(durability.locator('.sport-disclosure__finding')).toBeHidden()
    await durability.locator('.sport-disclosure__summary').click()
    await expect(durability.locator('.sport-disclosure__finding')).toBeVisible()
    await durability.locator('.sport-disclosure__summary').click()
    // Both of durability's readings are drawn.
    await expect(page.getByRole('region', { name: 'Durability' }).getByRole('figure')).toHaveCount(
      2,
    )
  }

  await goTo(page, 'Balance')
  await page.getByRole('main').getByRole('link', { name: 'How sure is this?' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'How sure is this?' })).toBeVisible()
  // A closed disclosure hides its chart, in every browser, until the reader opens it.
  await expect(page.locator('details.method__evidence').first()).not.toHaveAttribute('open')
  await expect(page.getByRole('figure', { name: RATIO })).toBeHidden()
  await showEvidence(page, 'energy view')
  await expect(page.getByRole('figure', { name: ENERGY_SCALE })).toBeVisible()
  await expect(page.getByRole('figure', { name: RATIO })).toBeVisible()
  await showEvidence(page, 'heart-rate check')
  await expect(page.getByRole('figure', { name: HEART_RATE })).toBeVisible()
  await showEvidence(page, 'virtual power meter')
  await expect(page.getByRole('figure', { name: POWER_ACCURACY })).toBeVisible()

  // The sample's season is longer than one page of the list.
  await expect(await activitiesRows(page)).toHaveCount(LIST_PAGE_SIZE)
  expect(errors).toEqual([])
})

test('the ride on foot tile names the ride behind its effort and opens to every duration', async ({
  page,
  isMobile,
}) => {
  await openSample(page)

  const card = page.getByRole('article', { name: 'Ride on foot' })
  await expect(card.getByRole('link', { name: /^Set on / })).toBeVisible()

  const details = card.locator('details')
  await expect(details).not.toHaveAttribute('open')
  await details.locator('summary').click()
  // A phone shows the efforts as a list, and a wider screen as a table.
  const rideEffort = isMobile
    ? details.getByRole('term').filter({ hasText: 'Ride effort' }).first()
    : details.getByRole('columnheader', { name: 'Ride effort' })
  await expect(rideEffort).toBeVisible()
})

test('Balance says the lean once: no lean tile, three tiles at most, and the level target under the lede', async ({
  page,
}) => {
  await openSample(page)

  await expect(page.getByRole('article', { name: 'Lean' })).toHaveCount(0)
  const tiles = page.locator('.balance-tiles')
  await expect(tiles.getByRole('article')).toHaveCount(3)
  await expect(tiles).not.toContainText(/\bpts\b/)
  // The gap in points is the meter's figure, once; the target is a line of the hero, not of a tile.
  await expect(page.locator('.balance-meter__number')).toHaveCount(1)
  const target = page.locator('.balance-hero').getByText(/^To match your/)
  await expect(target).toHaveCount(1)
  await expect(tiles.getByText(/^To match your/)).toHaveCount(0)
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
  await expect(run.getByText('Estimated', { exact: true })).toBeVisible()
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

test('a record link opened from Run keeps the Run tab lit and offers Back to Run', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Run')

  await page
    .getByRole('region', { name: 'Best efforts' })
    .locator('a.record-tiles__link, .record-tiles__shared a')
    .first()
    .click()

  await expect(page.getByRole('heading', { level: 1 })).not.toHaveText(BALANCE_TITLE)
  await expect(
    page
      .getByRole('navigation', { name: 'Sections' })
      .getByRole('link', { name: 'Run', exact: true }),
  ).toHaveClass(/header__tab--current/)
  await expect(page.getByRole('link', { name: 'Back to Run', exact: true })).toBeVisible()
})

test('the sport page opens a section the reader folded from "On this page", and says what it found when folded', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Run')
  const nav = page.getByRole('navigation', { name: 'On this page' })
  await expect(nav).toBeVisible()
  // A section with content is open to start with, and its row says its name and finding.
  const all = page.getByRole('region', { name: 'All best efforts' })
  await expect(all.locator('summary')).toContainText(/\d+ best efforts with their levels/)
  await expect(all.locator('details')).toHaveAttribute('open', '')
  await expect(all.locator('ul.records')).toBeVisible()
  // Folded, the row still says what it found, and "On this page" opens it again.
  await all.locator('summary').click()
  await expect(all.locator('details')).not.toHaveAttribute('open', '')
  await expect(all.locator('summary')).toContainText(/\d+ best efforts with their levels/)
  await expect(all.locator('ul.records')).toBeHidden()
  await nav.getByRole('button', { name: 'All best efforts' }).click()
  await expect(all.locator('details')).toHaveAttribute('open', '')
  await expect(all.locator('ul.records')).toBeVisible()
  // The address is the page's own: pressing the row did not move the app's hash route.
  await expect(page).toHaveURL(/#\/run$/)
})

/**
 * The top of the section tabs at a phone width. There they are fixed to the foot of the window and cover
 * what is under them, so a mark is on the first screen only when it ends above this line. The test fails
 * if they are not fixed there, since the line would then be wrong.
 */
async function tabBarTop(page: Page): Promise<number> {
  const tabs = page.locator('.header__tabs')
  expect(await tabs.evaluate((el) => getComputedStyle(el).position)).toBe('fixed')
  return (await edgesOf(tabs)).top
}

/** The meter's track, its value under the dot, and the two sports' level lines. */
const TRACK = '.balance-meter [role="img"]'
const VALUE = '.balance-meter__value'
const LEVEL_ROWS = '.balance-levels__row'

/** The fitness card's state, as the card names it, its sentence, and the change drawn as a track. */
const FITNESS_CARD = '.fitness-card[data-sport="run"]'
const FITNESS_STATE = `${FITNESS_CARD} .fitness-card__state`

// The balance leads the home page: at 1440 by 900 its headline, meter and levels are on the first screen, and the
// fitness card sits under the tiles, whole, with its track beside the words.
test('at 1440 by 900 the balance leads the first screen, and the fitness card sits under its tiles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openSample(page)
  const headline = await edgesOf(page.getByRole('heading', { level: 1 }))
  const meter = await edgesOf(page.locator(TRACK))
  const levels = await edgesOf(page.locator(LEVEL_ROWS).last())
  expect(headline.bottom).toBeLessThan(meter.top)
  expect(levels.bottom).toBeLessThanOrEqual(900)
  // The card comes after the tiles and before the grade by duration.
  const tiles = await edgesOf(page.locator('.balance-tiles'))
  const card = await edgesOf(page.locator(FITNESS_CARD))
  const grades = await edgesOf(page.getByRole('region', { name: 'Grade by duration' }))
  expect(card.top).toBeGreaterThanOrEqual(tiles.bottom)
  expect(card.bottom).toBeLessThanOrEqual(grades.top)
  await page.locator(FITNESS_CARD).scrollIntoViewIfNeeded()
  await expect(page.locator(FITNESS_STATE)).toHaveText('Slipping')
  await expect(page.getByTestId('fitness-new')).toContainText('since the week of')
  // The change's track sits beside the words on a wide screen, inside the card, and not under them.
  const trackEdges = await edgesOf(page.locator(`${FITNESS_CARD} .fitness-track`))
  const cardEdges = await edgesOf(page.locator(FITNESS_CARD))
  const trackBox = (await page.locator(`${FITNESS_CARD} .fitness-track`).boundingBox())!
  const sentenceBox = (await page.locator(`${FITNESS_CARD} .fitness-card__headline`).boundingBox())!
  const cardBox = (await page.locator(FITNESS_CARD).boundingBox())!
  expect(trackBox.x).toBeGreaterThanOrEqual(sentenceBox.x + sentenceBox.width)
  expect(trackBox.x + trackBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width)
  expect(trackEdges.bottom).toBeLessThanOrEqual(cardEdges.bottom)
  await expect(page.getByText('See the evidence')).toBeInViewport()
  // The meter is the first drawing on the page, and the card's track comes after it.
  const order = await page.evaluate(() => {
    const track = document.querySelector('.fitness-card[data-sport="run"] .fitness-track__bar')
    const firstImage = document.querySelector('main [role="img"]')
    return {
      trackAfter:
        track !== null &&
        firstImage !== null &&
        (firstImage.compareDocumentPosition(track) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
      firstImage: firstImage?.parentElement?.className ?? '',
    }
  })
  expect(order.trackAfter).toBe(true)
  expect(order.firstImage).toContain('balance-meter')
  // The answer is still a line: no scale drawing, no ladder, and the meter is in its place.
  await expect(page.locator('.balance-meter__value')).toHaveText(SAMPLE_TEXT.value)
  await expect(page.locator('.balance-hero__pair .balance-meter')).toHaveCount(1)
  await expect(page.locator('.balance-hero__pair svg:not(.icon)')).toHaveCount(0)
})

// A phone opens on the balance, the sample notice and all: at 390 by 844 and at 320 by 640 the headline, the meter
// and its value end above the section tabs fixed to the window's foot, and the fitness card follows the tiles.
for (const [width, height] of [
  [390, 844],
  [320, 640],
] as const) {
  test(`at ${width} by ${height} the balance headline, meter and value are above the section tabs, and the fitness card follows the tiles`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await openSample(page)
    await expect(page.getByText('Sample athlete', { exact: false }).first()).toBeVisible()
    const tabs = await tabBarTop(page)
    const headline = await edgesOf(page.getByRole('heading', { level: 1 }))
    const meter = await edgesOf(page.locator(TRACK))
    const value = await edgesOf(page.locator(VALUE))
    expect(headline.bottom).toBeLessThan(meter.top)
    expect(value.top).toBeGreaterThanOrEqual(meter.bottom)
    expect(value.bottom).toBeLessThanOrEqual(tabs)
    // Then both levels, in order, and the period.
    let previous = value.bottom
    const rows = await page.locator(LEVEL_ROWS).all()
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      const box = await edgesOf(row)
      expect(box.top).toBeGreaterThanOrEqual(previous)
      previous = box.bottom
    }
    const period = await edgesOf(page.getByRole('group', { name: 'Period' }))
    expect(period.top).toBeGreaterThanOrEqual(previous)
    // The card is under the tiles, and its state, sentence and track follow one another.
    const tiles = await edgesOf(page.locator('.balance-tiles'))
    const card = await edgesOf(page.locator(FITNESS_CARD))
    const state = await edgesOf(page.locator(FITNESS_STATE))
    const sentence = await edgesOf(page.locator(`${FITNESS_CARD} .fitness-card__headline`))
    const track = await edgesOf(page.locator(`${FITNESS_CARD} .fitness-track`))
    expect(card.top).toBeGreaterThanOrEqual(tiles.bottom)
    expect(sentence.top).toBeGreaterThanOrEqual(state.bottom)
    expect(track.top).toBeGreaterThanOrEqual(sentence.bottom)
    expect(track.bottom).toBeLessThanOrEqual(card.bottom)
    // Nothing collides, and the page does not scroll sideways.
    for (const selector of [
      FITNESS_CARD,
      `${FITNESS_CARD} .fitness-track__ends`,
      `${FITNESS_CARD} .fitness-card__headline`,
      '.balance-meter__ends',
      VALUE,
      '.balance-meter__edges',
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

// On a wide screen the headline runs the answer's full width, the lede keeps its 62 character measure, and the
// meter and the tiles span the same width.
test('at 1280 the headline runs the full width, the lede keeps its measure, and the meter spans the tiles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openSample(page)
  const headline = await page.getByRole('heading', { level: 1 }).boundingBox()
  const lede = await page.locator('.balance-hero .lede').boundingBox()
  const tiles = await page.locator('.balance-tiles').boundingBox()
  const meter = await page.locator('.balance-meter').boundingBox()
  if (headline === null || lede === null || tiles === null || meter === null) {
    throw new Error('no box for the headline, lede, tiles or meter')
  }
  // The lede keeps its own 62 character measure, which a probe in the lede's font measures.
  const sixtyTwoCh = await page.locator('.balance-hero .lede').evaluate((el) => {
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;visibility:hidden;width:62ch'
    probe.style.font = getComputedStyle(el).font
    el.parentElement!.appendChild(probe)
    const width = probe.getBoundingClientRect().width
    probe.remove()
    return width
  })
  expect(headline.width).toBeGreaterThan(lede.width)
  expect(lede.width).toBeLessThanOrEqual(sixtyTwoCh + 1)
  expect(meter.y).toBeGreaterThanOrEqual(lede.y + lede.height)
  expect(meter.x).toBeCloseTo(tiles.x, 0)
  expect(meter.x + meter.width).toBeCloseTo(tiles.x + tiles.width, 0)
})

// A landscape phone has too little height for the meter and a card: the balance's headline is what is on screen.
test('at 667 by 375 the balance headline is above the section tabs', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 })
  await openSample(page)
  const tabs = await tabBarTop(page)
  expect((await edgesOf(page.getByRole('heading', { level: 1 }))).bottom).toBeLessThanOrEqual(tabs)
})

test('the meter defines its terms in place, by press and by Enter', async ({ page }) => {
  await openSample(page)
  const level = page.locator(LEVEL_ROWS).first().getByRole('button')
  await expect(level).toHaveAttribute('aria-expanded', 'false')
  await level.click()
  await expect(level).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('note').filter({ hasText: /Recreational below 60%/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(level).toHaveAttribute('aria-expanded', 'false')
  await level.focus()
  await page.keyboard.press('Enter')
  await expect(level).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(level).toHaveAttribute('aria-expanded', 'false')
  const range = page.getByRole('button', { name: 'range', exact: true })
  await range.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('note').filter({ hasText: /nine times out of ten/ })).toBeVisible()
})

test('the meter is named in words and its value and levels are text, none under 12 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await openSample(page)
  await expect(page.locator(TRACK)).toHaveAccessibleName(
    new RegExp(`^${SAMPLE_TEXT.name} \\(range `),
  )
  await expect(page.locator(LEVEL_ROWS).nth(0)).toContainText(rowPattern(SAMPLE_TEXT.rows[0]!))
  await expect(page.locator(LEVEL_ROWS).nth(1)).toContainText(rowPattern(SAMPLE_TEXT.rows[1]!))
  const sizes = await page
    .locator(
      '.balance-meter__value > *, .balance-meter__range, .balance-meter__ends, .balance-levels__row > *',
    )
    .evaluateAll((nodes) => nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)))
  expect(sizes.length).toBeGreaterThan(6)
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12)
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
  test(`at ${width} by ${height} the range and level notes are sheets at the window's foot`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await openSample(page)
    const terms = [
      page.getByRole('button', { name: 'range', exact: true }),
      page.locator(LEVEL_ROWS).first().getByRole('button'),
    ]
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
  // The landing example defines the range and, once, the level; Method defines its own term.
  await page.goto('/')
  await expect(page.locator('.landing-example .definition')).toHaveCount(2)
  const landing = await definedTermAncestors(page)
  expect(landing.terms).toBeGreaterThanOrEqual(2)
  expect(landing.bad).toEqual([])
  await page.goto('/#/method')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const method = await definedTermAncestors(page)
  expect(method.terms).toBeGreaterThanOrEqual(1)
  expect(method.bad).toEqual([])
  await openSample(page)
  const balance = await definedTermAncestors(page)
  expect(balance.terms).toBeGreaterThanOrEqual(3)
  expect(balance.bad).toEqual([])
  for (const sport of ['Run', 'Ride'] as const) {
    await goTo(page, sport)
    const found = await definedTermAncestors(page)
    expect(found.terms, sport).toBeGreaterThan(0)
    expect(found.bad, sport).toEqual([])
  }
})

/**
 * Sets the meter's reading to a lead the sample does not give: where its dot sits, and the words and the character
 * counts the stylesheet keeps clear of the track's ends, as the component sets them.
 */
async function setReading(
  page: Page,
  reading: { at: string; number: string; unit: string; range: string; basis?: boolean },
): Promise<void> {
  await page.evaluate((r) => {
    const root = document.querySelector<HTMLElement>('.balance-meter__reading')
    const dot = document.querySelector<HTMLElement>('.balance-meter__dot')
    if (root === null || dot === null) throw new Error('no meter')
    dot.style.setProperty('--at', r.at)
    root.style.setProperty('--at', r.at)
    root.style.setProperty('--number-chars', String(r.number.length))
    root.style.setProperty('--unit-chars', String(r.unit.length))
    root.style.setProperty('--range-chars', String(r.range === '' ? 0 : r.range.length + 6))
    const text = 'informed by heart rate'
    root.style.setProperty('--basis-chars', String(r.basis === true ? text.length : 0))
    const set = (selector: string, value: string) => {
      const node = root.querySelector(selector)
      if (node !== null) node.textContent = value
    }
    set('.balance-meter__number', r.number)
    set('.balance-meter__unit', r.unit)
    set('.balance-meter__edges', r.range)
    const range = root.querySelector<HTMLElement>('.balance-meter__range')
    if (range !== null) range.style.display = r.range === '' ? 'none' : ''
    let basis = root.querySelector<HTMLElement>('.balance-meter__basis')
    if (basis === null) {
      basis = document.createElement('p')
      basis.className = 'balance-meter__basis'
      basis.textContent = text
      root.append(basis)
    }
    basis.style.display = r.basis === true ? '' : 'none'
  }, reading)
}

// The reading under the dot stays whole inside the plot, and so inside the window, at either end of the scale, with a
// long range, and with the heart-rate line alone: its number, its hanging unit, its range line and that line.
for (const [width, height] of [
  [1440, 900],
  [390, 844],
  [320, 640],
] as const) {
  test(`at ${width} the reading stays inside the window at the ends of the scale and with a long range`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await openSample(page)
    const cases = [
      { at: '2.5%', number: '+100', unit: 'pts', range: '84 to 120' },
      { at: '97.5%', number: '+100', unit: 'pts', range: '84 to 120' },
      { at: '2.5%', number: '+0.4', unit: '%', range: '-12.4% to +130.5%' },
      { at: '97.5%', number: '+0.4', unit: '%', range: '-12.4% to +130.5%' },
      { at: '50%', number: '+12', unit: '%', range: '-12.4% to +130.5%' },
      // No range line, as when the range rounds to one value: the heart-rate line alone holds the clamp.
      { at: '2.5%', number: '+12', unit: '%', range: '', basis: true },
      { at: '97.5%', number: '+12', unit: '%', range: '', basis: true },
      { at: '2.5%', number: '+12', unit: '%', range: '5% to 20%', basis: true },
    ]
    for (const reading of cases) {
      await setReading(page, reading)
      const found = await page.evaluate(() => {
        const rect = (node: Element | null) => {
          const box = node?.getBoundingClientRect()
          return box === undefined || box.width === 0 ? null : { left: box.left, right: box.right }
        }
        const reading = document.querySelector('.balance-meter__reading')
        return {
          plot: rect(document.querySelector('.balance-meter__plot')),
          parts: [
            '.balance-meter__number',
            '.balance-meter__unit',
            '.balance-meter__range',
            '.balance-meter__basis',
          ].map((selector) => {
            const node = reading?.querySelector(selector) ?? null
            return node !== null && getComputedStyle(node).display === 'none' ? null : rect(node)
          }),
        }
      })
      if (found.plot === null) throw new Error('no plot')
      // The plot runs from gutter to gutter: a part inside it is inside the window with the page's margin to spare.
      expect(found.parts.filter((box) => box !== null).length).toBeGreaterThanOrEqual(2)
      for (const box of found.parts) {
        if (box === null) continue
        expect(box.left, JSON.stringify(reading)).toBeGreaterThanOrEqual(found.plot.left - 0.5)
        expect(box.right, JSON.stringify(reading)).toBeLessThanOrEqual(found.plot.right + 0.5)
        expect(box.right, JSON.stringify(reading)).toBeLessThanOrEqual(width)
      }
      // Each line stays one line: the range does not wrap into a column, and the page does not scroll sideways.
      const heights = await page.evaluate(() =>
        ['.balance-meter__number', '.balance-meter__range'].map(
          (selector) =>
            (document.querySelector(selector)?.getBoundingClientRect().height ?? 0) /
            parseFloat(getComputedStyle(document.querySelector(selector) as Element).lineHeight),
        ),
      )
      for (const lines of heights) expect(lines, JSON.stringify(reading)).toBeLessThan(1.6)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
        JSON.stringify(reading),
      ).toBeLessThanOrEqual(0)
    }
  })
}

test('the number is centred under the dot, with its unit hanging off to the right', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSample(page)
  const dot = await page.locator('.balance-meter__dot').boundingBox()
  const number = await page.locator('.balance-meter__number').boundingBox()
  const unit = await page.locator('.balance-meter__unit').boundingBox()
  if (dot === null || number === null || unit === null) throw new Error('no meter boxes')
  expect(number.x + number.width / 2).toBeCloseTo(dot.x + dot.width / 2, 0)
  expect(unit.x).toBeGreaterThanOrEqual(number.x + number.width)
})
