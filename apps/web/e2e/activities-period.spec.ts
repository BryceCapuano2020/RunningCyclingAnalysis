import { expect, test } from '@playwright/test'
import { goTo, openSample } from './helpers.js'

/**
 * Balance and the sport pages show one period; the Activities list keeps its own, which starts with the whole
 * library (docs/DESIGN.md, Period). The list does not explain itself with a line: its own period control is
 * the explanation, and it is checked on All time whatever Balance is on. Run at the project's own window and at
 * 320 px.
 */
for (const width of [undefined, 320]) {
  test(`Activities keeps its own period when Balance is on a shorter one${width === undefined ? '' : ` at ${width} px`}`, async ({
    page,
  }) => {
    if (width !== undefined) await page.setViewportSize({ width, height: 640 })
    await openSample(page)
    await page.getByRole('radio', { name: /^6 (weeks|wk)$/ }).check({ force: true })
    await goTo(page, 'Activities')

    // The page is there, and its own control starts on the whole library.
    await expect(page.getByRole('heading', { level: 1, name: 'Activities' })).toBeVisible()
    await expect(page.getByRole('radio', { name: 'All time' })).toBeChecked()
    await expect(page.getByText(/This list has its own period/)).toHaveCount(0)
    await expect(page.getByText(/Balance, Run and Ride show/)).toHaveCount(0)

    // Narrowing the list is the list's own choice, and it still says nothing about the other pages.
    await page.getByRole('radio', { name: /^6 (weeks|wk)$/ }).check({ force: true })
    await expect(page.getByRole('radio', { name: /^6 (weeks|wk)$/ })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'All time' })).not.toBeChecked()
    await expect(page.getByText(/This list has its own period/)).toHaveCount(0)
  })
}
