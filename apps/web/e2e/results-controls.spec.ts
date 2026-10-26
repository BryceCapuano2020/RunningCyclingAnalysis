import { expect, test } from '@playwright/test'
import { BALANCE_TITLE, LANDING_TITLE, activitiesRows, goTo, openSample } from './helpers.js'

test('the Activities period narrows its own rows and All time restores them all, and a Balance pick hides none', async ({
  page,
}) => {
  await openSample(page)
  // Activities has its own period control, so a pick on Balance leaves every activity listed.
  await page.getByRole('group', { name: 'Period' }).getByText('6 weeks', { exact: true }).click()
  await expect(await activitiesRows(page)).toHaveCount(14)
  await expect(page.locator('.range-picker__count')).toHaveCount(0)

  const period = page.getByRole('group', { name: 'Period' })
  await period.getByText('6 weeks', { exact: true }).click()
  await expect(page.locator('.range-picker__count')).toHaveText(/^\d+ of 14 activities$/)
  const rows = page.locator('.activity-list__items > li')
  const shown = await rows.count()
  expect(shown).toBeGreaterThan(0)
  expect(shown).toBeLessThan(14)

  await period.getByText('All time', { exact: true }).click()
  await expect(page.locator('.range-picker__count')).toHaveCount(0)
  await expect(rows).toHaveCount(14)
})

test('the period picker is also on the Run and Ride pages', async ({ page }) => {
  await openSample(page)
  for (const sport of ['Run', 'Ride'] as const) {
    await goTo(page, sport)
    await expect(page.getByRole('group', { name: 'Period' })).toBeVisible()
  }
})

test('a six-week period compares the best efforts with the six weeks before it', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Run')
  await expect(page.getByRole('list', { name: 'Legend' })).toHaveCount(0)

  await page.getByRole('group', { name: 'Period' }).getByText('6 weeks', { exact: true }).click()
  await expect(
    page.getByRole('list', { name: 'Legend' }).getByText('Previous 6 weeks'),
  ).toBeVisible()
})

test('the fitness over time card shows for sample data, and its table toggles', async ({
  page,
}) => {
  await openSample(page)
  const card = page.locator('section').filter({
    has: page.getByRole('heading', {
      level: 2,
      name: /^(Age grade|Energy rate) of your best 20 min, trailing/,
    }),
  })
  await expect(card).toBeVisible()
  await expect(
    card.getByRole('figure', {
      name: /^(Age grade|Energy rate) of your best 20 min, trailing/,
    }),
  ).toBeAttached()

  // The trend has its own table view, which is checked here.
  const details = card.locator('details').first()
  await expect(details).not.toHaveAttribute('open')
  await details.locator('summary').click()
  await expect(details).toHaveAttribute('open')
  await expect(details.getByRole('columnheader', { name: 'Week ending' })).toBeVisible()
  await expect(details.getByRole('rowheader').first()).toHaveText(
    /^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}( \d{4})?$/,
  )

  await details.locator('summary').click()
  await expect(details).not.toHaveAttribute('open')
})

test('the period control offers 6 weeks, 12 weeks, 12 months and All time, on one row at 390 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSample(page)
  const options = page.getByRole('group', { name: 'Period' }).locator('.segmented-control__option')
  await expect(options).toHaveText(['6 weeks', '12 weeks', '12 months', 'All time'])
  const tops = await options.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().top)),
  )
  expect(new Set(tops).size).toBe(1)
})

test('on a phone the grades sit under the meter, with the meter’s own gap', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.use.isMobile, 'the grade strip shows only on a phone')
  await openSample(page)
  const key = await page.locator('.balance-meter__key').boundingBox()
  const strip = page.locator('.balance-strip')
  await expect(strip).toBeVisible()
  const stripBox = await strip.boundingBox()
  expect(key).not.toBeNull()
  expect(stripBox).not.toBeNull()
  // The meter's own gap is 8 px; the page's gap between sections is 48 px, which the strip must not take.
  const gap = (stripBox?.y ?? 0) - ((key?.y ?? 0) + (key?.height ?? 0))
  expect(gap).toBeLessThan(16)
})

test('period labels remain clickable at a narrow viewport with enlarged text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await openSample(page)
  await page.addStyleTag({ content: ':root { font-size: 20px; }' })
  const period = page.getByRole('group', { name: 'Period' })
  await period.getByText('6 weeks', { exact: true }).click()
  await expect(page.getByText(/^\d+ of 14 activities$/)).toBeVisible()
  await period.getByText('All time', { exact: true }).click()
  // The count leaves the caption once the pick is answered; a slow runner can still be applying it.
  await expect(page.getByText(/^\d+ of 14 activities$/)).toHaveCount(0)
  await expect(await activitiesRows(page)).toHaveCount(14)
})

test('How sure is this? keeps the disclaimer that hard best efforts do not prove either was the hardest', async ({
  page,
}) => {
  await openSample(page)
  // The sample's best 20 minute efforts both reach 90% of their reference heart rate, so the
  // Evidence card reports real efforts and the method page says what that does not prove.
  await expect(page.getByRole('region', { name: 'Hard efforts on file' })).toBeVisible()

  await page.getByRole('main').getByRole('link', { name: 'How sure is this?' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'How sure is this?' })).toBeVisible()
  await expect(
    page.getByText('That makes them hard, but does not prove either was your hardest.'),
  ).toBeVisible()
})

test('focus moves to the Balance heading after sample data, and to the landing heading after removing all activities', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'See a sample athlete' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(BALANCE_TITLE)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()

  await goTo(page, 'Profile')
  await page.getByRole('button', { name: 'Clear the analysis' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeFocused()
})

test('the Balance run card’s best efforts open and shut on each press, by mouse and by Enter, at 390 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSample(page)
  const fold = page.locator('section.sport-card--run details.sport-card__records')
  const summary = fold.locator('summary')
  // On a phone the best efforts start folded away.
  await expect(fold).not.toHaveAttribute('open')

  // Each press is one change: the first press opens the fold, rather than the browser shutting it again.
  await summary.click()
  await expect(fold).toHaveAttribute('open')
  await summary.click()
  await expect(fold).not.toHaveAttribute('open')

  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(fold).toHaveAttribute('open')
  await page.keyboard.press('Enter')
  await expect(fold).not.toHaveAttribute('open')
})
