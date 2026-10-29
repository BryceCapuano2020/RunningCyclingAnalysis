import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
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
 * The charts by their figure titles. Balance's level scale is named by its sentence; its energy meter, which
 * stands in while the grades are missing, by the balance's own.
 */
const BALANCE_METER =
  /^Age-grade level of your best 20 min\.|^(Running|Cycling) (grades \d+ points? higher|\d+% higher)|^In balance: |^Even within the model's range/
/**
 * The Balance trend: one chart for both sports, as age grades when the age and sex are known. Its title says
 * what it found, so it is found by the line under it that names the measure.
 */
const BALANCE_TREND = /(Age grade|Energy rate) of your best 20 min, trailing/
const RUN_CURVE = /^Run flat pace per (kilometre|mile) by duration$/
const RIDE_CURVE = /^Ride power in watts by duration$/
/** The section that compares each best with the athlete's other bests. */
const NOT_ENOUGH_YET = 'Not enough yet'
/** The sport page's section that is open and needs a season of activities; the others sit behind closed rows. */
const OPEN_SEASON_SECTION = 'Week by week'
/** The closed sections that need a season: each row says its finding, and opens to a chart. */
const CLOSED_SEASON_SECTIONS = ['At the same heart rate', 'Late in long sessions']
/** The closed row of the finding that compares each best with the athlete's other bests. */
const STAND_OUT_SECTION = 'Where your bests stand out'
const STANDS_OUT_LINE = /^(?:Your bests are in line with each other|.*stand out)/
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
  await expect(page.locator('figure').filter({ hasText: BALANCE_TREND })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: SAMPLE_BANNER })).toHaveCount(1)

  // The sample's season is long and varied enough to fill every section of a sport page, so none of them
  // is left to the "Not enough yet" list: stand-out, week by week, same heart rate, late in long sessions.
  for (const sport of ['Run', 'Ride'] as const) {
    await goTo(page, sport)
    await expect(
      page.getByRole('figure', { name: sport === 'Run' ? RUN_CURVE : RIDE_CURVE }),
    ).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: OPEN_SEASON_SECTION })).toBeVisible()
    // A closed row says what it found, so closed still tells the athlete something; it opens to its chart.
    const standOut = page.getByRole('region', { name: STAND_OUT_SECTION })
    await expect(standOut.locator('.sport-disclosure__finding')).toHaveText(STANDS_OUT_LINE)
    for (const section of CLOSED_SEASON_SECTIONS) {
      const region = page.getByRole('region', { name: section })
      await expect(region.locator('.sport-disclosure__finding')).toBeVisible()
      await expect(region.locator('.sport-disclosure__finding')).not.toBeEmpty()
      await region.locator('summary').click()
      await expect(region.getByRole('figure').first()).toBeVisible()
    }
    await expect(page.getByRole('heading', { level: 2, name: NOT_ENOUGH_YET })).toHaveCount(0)
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

test('uploading a single run names cycling as the missing sport and keeps the run tile', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['one-run.fit'])

  await expect(
    page.getByRole('heading', { level: 1, name: 'Add a ride to see your balance' }),
  ).toBeVisible()
  const run = page.getByRole('article', { name: 'Run threshold' })
  await expect(run).toBeVisible()
  await expect(run.getByText('Estimated', { exact: true })).toBeVisible()
})

test('uploading a file that is not FIT lists it as unusable and keeps the landing page', async ({
  page,
}) => {
  await page.goto('/')
  await uploadFixtures(page, ['not-a-fit.fit'])

  await expect(page.getByText('1 file: 1 needs a look.', { exact: true })).toBeVisible()
  // The first skipped file is named under the headline. A lone file is the group's only line, so
  // the group has no title and nothing to open, and the file is named once.
  await expect(page.getByText('Need a look: 1 file')).toHaveCount(0)
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
  await expect(page.getByText('Add FIT, GPX or TCX files, or a Strava export zip')).toBeVisible()
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

test('the sport page opens a closed section from "On this page", and says what it found when closed', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Run')
  const nav = page.getByRole('navigation', { name: 'On this page' })
  await expect(nav).toBeVisible()
  // A closed section says its name and finding on its row, before it is opened.
  const all = page.getByRole('region', { name: 'All best efforts' })
  await expect(all.locator('summary')).toContainText(/\d+ best efforts with their levels/)
  await expect(all.locator('details')).not.toHaveAttribute('open', '')
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

/** The level scale's drawing, and the two sports' marks on it. */
const SCALE = '.balance-scale__svg'
const RUN_DOT = '.balance-scale [data-sport="run"] .balance-scale__dot'
const RIDE_RING = '.balance-scale [data-sport="ride"] .balance-scale__ring'

// The answer's one picture is on the first screen: at 1440 by 900 the whole drawing ends above the fold, and
// the first chart is the level scale, not the trend 1,900 px down.
test('at 1440 by 900 the level scale is on the first screen, whole', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openSample(page)
  const scale = await edgesOf(page.locator(SCALE))
  expect(scale.bottom).toBeLessThanOrEqual(900)
  expect((await edgesOf(page.locator(RUN_DOT))).bottom).toBeLessThanOrEqual(900)
  expect((await edgesOf(page.locator(RIDE_RING))).bottom).toBeLessThanOrEqual(900)
  // It is the first graphic on the page: nothing drawn comes before it.
  const first = await page.evaluate(
    () => document.querySelector('main svg:not(.icon)')?.getAttribute('class') ?? '',
  )
  expect(first).toContain('balance-scale__svg')
})

// A phone holds the scale in its first 600 px. At 390 by 844 both marks are above the tabs fixed to the window's
// foot; at 320 by 640, with the sample notice's two lines above, the run's mark is, and the ride's is just below.
test('at 390 by 844 the level scale starts in the first 600 px, with both marks above the section tabs', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSample(page)
  const tabs = await tabBarTop(page)
  expect((await edgesOf(page.locator(SCALE))).top).toBeLessThanOrEqual(600)
  expect((await edgesOf(page.locator(RUN_DOT))).bottom).toBeLessThanOrEqual(tabs)
  expect((await edgesOf(page.locator(RIDE_RING))).bottom).toBeLessThanOrEqual(tabs)
  const scale = await edgesOf(page.locator(SCALE))
  for (const mark of [RUN_DOT, RIDE_RING]) {
    const box = await edgesOf(page.locator(mark))
    expect(box.top).toBeGreaterThanOrEqual(scale.top)
    expect(box.bottom).toBeLessThanOrEqual(scale.bottom)
  }
})

test('at 320 by 640 the level scale starts in the first 600 px, with the run’s mark above the section tabs and both marks inside its box', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await openSample(page)
  const tabs = await tabBarTop(page)
  const scale = await edgesOf(page.locator(SCALE))
  const run = await edgesOf(page.locator(RUN_DOT))
  const ride = await edgesOf(page.locator(RIDE_RING))
  expect(scale.top).toBeLessThanOrEqual(600)
  expect(run.bottom).toBeLessThanOrEqual(tabs)
  // Both lanes' marks are drawn inside the drawing's own box, whether or not the foot bar covers one.
  for (const mark of [run, ride]) {
    expect(mark.top).toBeGreaterThanOrEqual(scale.top)
    expect(mark.bottom).toBeLessThanOrEqual(scale.bottom)
  }
  // The ride's lane is below the run's, and the drawing is tall enough to hold both.
  expect(ride.top).toBeGreaterThan(run.bottom)
})

// On a wide screen the headline runs the answer's full width, the lede keeps its 62 character measure, and the
// scale and the tiles span the same width.
test('at 1280 the headline runs the full width, the lede keeps its measure, and the scale spans the tiles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openSample(page)
  const headline = await page.getByRole('heading', { level: 1 }).boundingBox()
  const lede = await page.locator('.balance-hero .lede').boundingBox()
  const tiles = await page.locator('.balance-tiles').boundingBox()
  const scale = await page.locator('.balance-scale').boundingBox()
  if (headline === null || lede === null || tiles === null || scale === null) {
    throw new Error('no box for the headline, lede, tiles or scale')
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
  expect(scale.y).toBeGreaterThanOrEqual(lede.y + lede.height)
  expect(scale.x).toBeCloseTo(tiles.x, 0)
  expect(scale.x + scale.width).toBeCloseTo(tiles.x + tiles.width, 0)
})

// A landscape phone has too little height for the headline and a drawing: the answer is what is on screen.
test('at 667 by 375 the headline and the gap figure are above the section tabs', async ({
  page,
}) => {
  await page.setViewportSize({ width: 667, height: 375 })
  await openSample(page)
  const tabs = await tabBarTop(page)
  expect((await edgesOf(page.getByRole('heading', { level: 1 }))).bottom).toBeLessThanOrEqual(tabs)
})

test('the level scale defines its terms in place, by press and by Enter', async ({ page }) => {
  await openSample(page)
  const level = page.getByRole('button', { name: 'level', exact: true })
  await expect(level).toHaveAttribute('aria-expanded', 'false')
  await level.click()
  await expect(level).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('note').filter({ hasText: /Recreational below 60%/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(level).toHaveAttribute('aria-expanded', 'false')
  await level.focus()
  await page.keyboard.press('Enter')
  await expect(level).toHaveAttribute('aria-expanded', 'true')
})

test('the level scale has its figures as a table, and no text on it is under 11 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await openSample(page)
  const sizes = await page
    .locator('.balance-scale svg text')
    .evaluateAll((labels) => labels.map((label) => parseFloat(getComputedStyle(label).fontSize)))
  expect(sizes.length).toBeGreaterThan(5)
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11)
  const details = page.locator('.balance-scale__details')
  await details.locator('summary').click()
  await expect(details.getByRole('cell', { name: 'Recorded' })).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0)
})
