import { expect, test } from '@playwright/test'
import { goTo, openSample } from './helpers.js'

/**
 * Balance and the sport pages show one period; the Activities list keeps its own, which starts with the whole
 * library (docs/DESIGN.md, Period). When the two differ the list says so, so a visitor who picked 6 weeks on Balance
 * and finds "All time" here is not left to wonder whether the choice was lost. Run at the project's own window and
 * at 320 px.
 */
for (const width of [undefined, 320]) {
  test(`Activities says it has its own period when Balance is on a shorter one${width === undefined ? '' : ` at ${width} px`}`, async ({
    page,
  }) => {
    if (width !== undefined) await page.setViewportSize({ width, height: 640 })
    await openSample(page)
    await page.getByRole('radio', { name: /^6 (weeks|wk)$/ }).check({ force: true })
    await goTo(page, 'Activities')

    const note = page.getByText(
      'Balance, Run and Ride show the last 6 weeks. This list has its own period.',
    )
    await expect(note).toBeVisible()
    await expect(page.getByRole('radio', { name: 'All time' })).toBeChecked()

    // Setting the list to the same length makes the two agree, and the line goes.
    await page.getByRole('radio', { name: /^6 (weeks|wk)$/ }).check({ force: true })
    await expect(note).toHaveCount(0)
  })
}

test('Activities says the other pages show all time when its own list is on 6 weeks', async ({
  page,
}) => {
  await openSample(page)
  await page.getByRole('radio', { name: 'All time' }).check({ force: true })
  await goTo(page, 'Activities')
  const note = page.getByText('Balance, Run and Ride show all time. This list has its own period.')
  // Both on all time: nothing to say.
  await expect(page.getByRole('radio', { name: 'All time' })).toBeChecked()
  await expect(note).toHaveCount(0)

  await page.getByRole('radio', { name: /^6 (weeks|wk)$/ }).check({ force: true })
  await expect(note).toBeVisible()
})
