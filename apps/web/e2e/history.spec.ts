import { expect, test } from '@playwright/test'
import { goTo, openSample, trackErrors } from './helpers.js'

/** The History tab sits between Ride and Activities, and on the sample shows its totals and hours chart. */
test('the History tab opens on the sample with its totals, hours chart, keyboard reading and table', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)
  // Balance, Run and Ride are the rail's pages; History sits first among the header's, before Activities and Method.
  const rail = page.getByRole('navigation', { name: 'Pages', exact: true }).getByRole('link')
  expect((await rail.allTextContents()).map((tab) => tab.trim())).toEqual([
    'Balance',
    'Run',
    'Ride',
  ])
  const more = page.getByRole('navigation', { name: 'More pages' }).getByRole('link')
  expect((await more.allTextContents()).map((tab) => tab.trim())).toEqual([
    'History',
    'Activities',
    'Method',
  ])

  await goTo(page, 'History')
  await expect(page).toHaveTitle(/^History · /)
  await expect(page.getByText('Years on file')).toBeVisible()
  await expect(page.getByText('Ride distance')).toBeVisible()
  const chart = page.getByRole('figure', { name: 'Hours per year' })
  expect(await chart.getByTestId('year-bar').count()).toBeGreaterThan(0)

  // The keyboard reads the last year: each sport's hours, and the total.
  await chart.getByTestId('plot-surface').focus()
  await page.keyboard.press('End')
  await expect(chart.getByRole('status')).toContainText('Total')
  await chart.locator('details.chart-frame__details > summary').click()
  await expect(chart.getByRole('table').getByRole('row').nth(1)).toBeVisible()
  expect(errors).toEqual([])
})

/** The eight charts of the History tab, in page order, each opening on the sample. */
const SECTIONS = [
  'balance-over-years',
  'training-calendar',
  'hours-per-year',
  'year-to-date',
  'bests-by-year',
  'best-curve-by-year',
  'fitness-over-years',
  'intensity-by-year',
]

test('the History tab draws all eight charts in page order, and a sport toggle redraws its chart in place', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)
  await goTo(page, 'History')
  await expect(page.getByText('Years on file')).toBeVisible()
  const sections = page.locator('[data-section]')
  await expect(sections).toHaveCount(SECTIONS.length)
  expect(
    await sections.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-section'))),
  ).toEqual(SECTIONS)
  // Each section draws a chart of the sample, not the message that it has nothing to draw.
  await expect(page.locator('[data-section] .chart-frame__empty')).toHaveCount(0)

  // The toggle sits in the chart's control row, and choosing the ride redraws the chart around it.
  const bests = page.locator('[data-section="bests-by-year"]')
  await expect(bests.getByRole('figure', { name: 'Run bests by year' })).toBeVisible()
  await bests.locator('.chart-frame__controls').getByText('Ride', { exact: true }).click()
  await expect(bests.getByRole('figure', { name: 'Ride bests by year' })).toBeVisible()
  await expect(
    bests.locator('.chart-frame__controls').getByRole('radio', { name: 'Ride' }),
  ).toBeChecked()
  expect(errors).toEqual([])
})

/** The fitness dots: one drawing for every steady activity, a toggle for the sport, a reading for each year and its table. */
test('the History tab draws the fitness dots in one node, toggles the sport, and reads a year by keyboard', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)
  await goTo(page, 'History')
  const section = page.locator('[data-section="fitness-over-years"]')
  const chart = section.getByRole('figure', { name: 'Fitness over the years' })
  await expect(chart.getByTestId('fitness-dots')).toHaveCount(1)
  const dots = async () =>
    ((await chart.getByTestId('fitness-dots').getAttribute('d')) ?? '').split(/[Mm]/).length - 1
  expect(await dots()).toBeGreaterThan(10)
  await expect(chart).toContainText('on steady runs')
  await chart.locator('.chart-frame__controls').getByText('Ride', { exact: true }).click()
  await expect(chart).toContainText('on steady rides')
  await chart.getByTestId('plot-surface').focus()
  await page.keyboard.press('End')
  await expect(chart.getByRole('status')).toContainText('Steady rides')
  await chart.locator('details.chart-frame__details > summary').click()
  await expect(chart.getByRole('table').first().getByRole('row').nth(1)).toBeVisible()
  expect(errors).toEqual([])
})

/** The part of an element that a phone would cut off: text the box clips, or a row that runs past its container. */
const CUT_OFF = `
  [...document.querySelectorAll('.history *')]
    .filter((el) => !el.closest('svg, .table-scroll, .sr-only'))
    .flatMap((el) => {
      const style = getComputedStyle(el)
      const clipped = style.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1
      const ellipsis = style.textOverflow === 'ellipsis' || getComputedStyle(el, '::before').textOverflow === 'ellipsis'
      return clipped || ellipsis ? [el.className.toString() || el.tagName] : []
    })
`

test('on a 390 px phone the History tab labels every bar, wraps its toggles and readouts, and cuts nothing off', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await openSample(page)
  await goTo(page, 'History')
  await expect(page.getByText('Years on file')).toBeVisible()

  // Every year has its bar and its label under it.
  const years = Number(await page.locator('.history-summary .row__figure').first().textContent())
  expect(years).toBeGreaterThan(1)
  const hours = page.locator('[data-section="hours-per-year"]')
  await expect(hours.locator('.chart-x-axis__tick')).toHaveCount(years)

  // No sentence is cut with an ellipsis, in a readout row or anywhere else, and no row runs past the page.
  for (const section of SECTIONS)
    await page.locator(`[data-section="${section}"]`).scrollIntoViewIfNeeded()
  expect(await page.evaluate(CUT_OFF)).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  // A toggle sits inside its chart's control row, whether it shares the row with a key or wraps below it.
  const rows = page.locator('[data-section] .chart-frame__controls')
  const count = await rows.count()
  expect(count).toBeGreaterThan(3)
  for (let i = 0; i < count; i++) {
    const fits = await rows.nth(i).evaluate((row) => row.scrollWidth <= row.clientWidth + 1)
    expect(fits).toBe(true)
  }
  expect(errors).toEqual([])
})

test('the History tab marks the year still going, tells the calendar’s tints apart, and names three years at most', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)
  await goTo(page, 'History')
  await expect(page.getByText('Years on file')).toBeVisible()

  // A year that is going is drawn lighter and keyed, and is the same year the bars call "so far" when read.
  const hours = page.locator('[data-section="hours-per-year"]')
  const partial = await hours.locator('[data-partial]').count()
  const keyed = await hours
    .getByRole('list', { name: 'Legend' })
    .getByText(/ so far$/)
    .count()
  expect(keyed).toBe(partial > 0 ? 1 : 0)
  if (partial > 0) {
    await hours.getByTestId('plot-surface').focus()
    await page.keyboard.press('End')
    await expect(hours.getByRole('status')).toContainText('so far')
  }

  // The calendar's steps each take a fill of their own, and the key ends with an open edge.
  const calendar = page.locator('[data-section="training-calendar"]')
  const painted = await calendar
    .getByTestId('calendar-cell')
    .evaluateAll((cells) =>
      cells.map((cell) => [cell.getAttribute('data-step'), getComputedStyle(cell).fill]),
    )
  const steps = new Set(painted.map(([step]) => step))
  expect(steps.size).toBeGreaterThanOrEqual(3)
  expect(new Set(painted.map(([, fill]) => fill)).size).toBe(steps.size)
  await expect(calendar.getByTestId('calendar-ramp-edge').last()).toHaveText(/\+$/)

  // At most the current year, the best past year and the one before are named on the year-to-date chart.
  const names = page.locator('[data-section="year-to-date"] text.chart-series__label')
  expect(await names.count()).toBeLessThanOrEqual(3)
  expect(await names.count()).toBeGreaterThan(0)
  expect(errors).toEqual([])
})
