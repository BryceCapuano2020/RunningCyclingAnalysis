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

/** The fitness dots: one drawing for every steady activity, a toggle for the sport, a reading for each year and its table. */
test('the History tab draws the fitness dots in one node, toggles the sport, and reads a year by keyboard', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)
  await goTo(page, 'History')
  const chart = page.getByRole('figure', { name: 'Fitness over the years' })
  await expect(chart.getByTestId('fitness-dots')).toHaveCount(1)
  const dots = async () =>
    ((await chart.getByTestId('fitness-dots').getAttribute('d')) ?? '').split(/[Mm]/).length - 1
  expect(await dots()).toBeGreaterThan(10)
  await expect(chart).toContainText('on steady runs')
  await page.getByRole('radio', { name: 'Ride' }).check({ force: true })
  await expect(chart).toContainText('on steady rides')
  await chart.getByTestId('plot-surface').focus()
  await page.keyboard.press('End')
  await expect(chart.getByRole('status')).toContainText('Steady rides')
  await chart.getByText('View as table').click()
  await expect(chart.getByRole('table').first().getByRole('row').nth(1)).toBeVisible()
  expect(errors).toEqual([])
})
