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

test('Custom applies the two days entered, and the caption dates the period they name', async ({
  page,
}) => {
  await openSample(page)
  const period = page.getByRole('group', { name: 'Period' })
  await period.getByText('Custom', { exact: true }).click()
  const form = page.locator('.range-picker__custom')
  await form.getByLabel('From').fill('2000-01-01')
  await form.getByLabel('To').fill('2000-01-02')
  // The range applies on Apply, so the caption still dates the period on screen until then.
  await expect(page.locator('.range-picker__dates')).not.toHaveText('1 Jan – 2 Jan 2000')
  await form.getByRole('button', { name: 'Apply' }).click()
  await expect(page.locator('.range-picker__dates')).toHaveText('1 Jan – 2 Jan 2000')
  await expect(page.locator('.range-picker__count')).toHaveText('0 of 14 activities')
  await expect(period.getByRole('radio', { name: 'Custom' })).toBeChecked()
})

test('the Custom form fits 320 px, with no page scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await openSample(page)
  await page.getByRole('group', { name: 'Period' }).getByText('Custom', { exact: true }).click()
  const form = page.locator('.range-picker__custom')
  await expect(form.getByLabel('From')).toBeVisible()
  const edges = await form
    .locator('input, button')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().right))
  for (const right of edges) expect(right).toBeLessThanOrEqual(320)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(overflow).toBeLessThanOrEqual(320)
})

test('the Custom fields are a control tall with 16 px text, Apply sits below them, and Custom is not a bar at 390 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSample(page)
  const period = page.getByRole('group', { name: 'Period' })
  await period.getByText('Custom', { exact: true }).click()
  const form = page.locator('.range-picker__custom')
  const from = form.getByLabel('From')
  const fromBox = await from.boundingBox()
  const applyBox = await form.getByRole('button', { name: 'Apply' }).boundingBox()
  const customBox = await period.locator('.segmented-control__option').last().boundingBox()
  expect(fromBox?.height ?? 0).toBeGreaterThanOrEqual(40)
  expect(await from.evaluate((element) => getComputedStyle(element).fontSize)).toBe('16px')
  expect((applyBox?.y ?? 0) > (fromBox?.y ?? 0) + (fromBox?.height ?? 0)).toBe(true)
  expect(customBox?.width ?? 390).toBeLessThan(200)
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
    card.locator('figure').filter({
      hasText: /(Age grade|Energy rate) of your best 20 min, trailing/,
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

test('the period control offers 6 weeks, 12 weeks, 12 months, All time and Custom, within 390 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSample(page)
  const options = page.getByRole('group', { name: 'Period' }).locator('.segmented-control__option')
  await expect(options).toHaveText(['6 weeks', '12 weeks', '12 months', 'All time', 'Custom'])
  // Five segments wrap onto a second row at 390 px rather than overflow the page.
  const edges = await options.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect()
      return { left: box.left, right: box.right }
    }),
  )
  for (const edge of edges) {
    expect(edge.left).toBeGreaterThanOrEqual(0)
    expect(edge.right).toBeLessThanOrEqual(390)
  }
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

test('How sure is this? says that both best efforts were hard efforts', async ({ page }) => {
  await openSample(page)
  // The sample's best 20 minute efforts both reach 90% of their reference heart rate, so the
  // Evidence card reports real efforts and the method page says they were hard efforts.
  await expect(page.getByRole('region', { name: 'Hard efforts on file' })).toBeVisible()

  await page.getByRole('main').getByRole('link', { name: 'How sure is this?' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'How sure is this?' })).toBeVisible()
  await expect(page.getByText(/so both were hard efforts\./)).toBeVisible()
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
