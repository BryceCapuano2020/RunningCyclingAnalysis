import { expect, test } from '@playwright/test'
import { goTo, openSample, trackErrors } from './helpers.js'

/** The History tab sits between Ride and Activities, and on the sample shows its totals and hours chart. */
test('the History tab opens on the sample with its totals, hours chart, keyboard reading and table', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)
  const tabs = page.getByRole('navigation', { name: 'Sections' }).getByRole('link')
  expect((await tabs.allTextContents()).map((tab) => tab.trim())).toEqual([
    'Balance',
    'Run',
    'Ride',
    'History',
    'Activities',
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
  await chart.getByText('View as table').click()
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
  await chart.getByText('View as table').click()
  await expect(chart.getByRole('table').first().getByRole('row').nth(1)).toBeVisible()
  expect(errors).toEqual([])
})
