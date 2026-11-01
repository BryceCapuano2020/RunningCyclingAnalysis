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
