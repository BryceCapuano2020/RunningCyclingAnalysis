import { expect, test } from '@playwright/test'
import {
  BALANCE_TITLE,
  LANDING_TITLE,
  LIST_PAGE_SIZE,
  activitiesRows,
  goTo,
  openSample,
  periodSegment,
  openMethod,
} from './helpers.js'

test('the Activities period narrows its own rows and All time restores them all, and a Balance pick hides none', async ({
  page,
}) => {
  await openSample(page)
  // Activities has its own period control, so a pick on Balance leaves every activity listed.
  await periodSegment(page.getByRole('group', { name: 'Period' }), '6 weeks').click()
  // The sample's season is far longer than a page of the list, so a full list shows one page of rows.
  await expect(await activitiesRows(page)).toHaveCount(LIST_PAGE_SIZE)
  await expect(page.locator('.range-picker__count')).toHaveCount(0)

  const period = page.getByRole('group', { name: 'Period' })
  await periodSegment(period, '6 weeks').click()
  const count = page.locator('.range-picker__count')
  await expect(count).toHaveText(/^\d+ of \d+ activities$/)
  const [, inPeriod, total] =
    /^(\d+) of (\d+) activities$/.exec((await count.textContent()) ?? '') ?? []
  expect(Number(inPeriod)).toBeGreaterThan(0)
  expect(Number(inPeriod)).toBeLessThan(Number(total))
  const rows = page.locator('.activity-list__items > li')
  await expect(rows).toHaveCount(Math.min(Number(inPeriod), LIST_PAGE_SIZE))

  await periodSegment(period, 'All time').click()
  await expect(page.locator('.range-picker__count')).toHaveCount(0)
  await expect(rows).toHaveCount(LIST_PAGE_SIZE)
})

test('Custom applies the two days entered, and the caption dates the period they name', async ({
  page,
}) => {
  await openSample(page)
  const period = page.getByRole('group', { name: 'Period' })
  await periodSegment(period, 'Custom').click()
  const form = page.locator('.range-picker__custom')
  await form.getByLabel('From').fill('2000-01-01')
  await form.getByLabel('To').fill('2000-01-02')
  await form.getByRole('button', { name: 'Apply' }).click()
  await expect(period.getByRole('radio', { name: 'Custom' })).toBeChecked()
  // The dates and the count are in the sport page's Details, one press down.
  await goTo(page, 'Run')
  await page.locator('.sport-page__head .page-details > summary').click()
  const row = (label: RegExp) =>
    page.locator('.sport-page__head .props__row', { hasText: label }).locator('dd')
  await expect(row(/^Period/)).toHaveText('1 Jan – 2 Jan 2000')
  await expect(row(/^Runs/)).toHaveText(/^0 of \d+$/)
  await expect(period.getByRole('radio', { name: 'Custom' })).toBeChecked()
})

test('the Custom form fits 320 px, with no page scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await openSample(page)
  await periodSegment(page.getByRole('group', { name: 'Period' }), 'Custom').click()
  const form = page.locator('.range-picker__custom')
  await expect(form.getByLabel('From')).toBeVisible()
  const edges = await form
    .locator('input, button')
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().right))
  for (const right of edges) expect(right).toBeLessThanOrEqual(320)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(overflow).toBeLessThanOrEqual(320)
})

test('the Custom fields are a control tall with 16 px text or more, Apply sits below them, and Custom is not a bar at 390 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSample(page)
  const period = page.getByRole('group', { name: 'Period' })
  await periodSegment(period, 'Custom').click()
  const form = page.locator('.range-picker__custom')
  const from = form.getByLabel('From')
  const fromBox = await from.boundingBox()
  const applyBox = await form.getByRole('button', { name: 'Apply' }).boundingBox()
  const customBox = await period.locator('.segmented-control__option').last().boundingBox()
  expect(fromBox?.height ?? 0).toBeGreaterThanOrEqual(40)
  // 16 px or more, so a phone does not zoom the page when the field takes focus.
  expect(
    await from.evaluate((element) => parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(16)
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
  // The default 12 weeks have a 12 weeks before them in the sample's long season.
  const legend = page.getByRole('list', { name: 'Legend' })
  await expect(legend.getByText('Previous 12 weeks')).toBeVisible()

  await periodSegment(page.getByRole('group', { name: 'Period' }), '6 weeks').click()
  await expect(legend.getByText('Previous 6 weeks')).toBeVisible()
  await expect(legend.getByText('Previous 12 weeks')).toHaveCount(0)
})

test('the period control offers 6 weeks, 12 weeks, 6 months, 12 months, All time and Custom, within 390 px', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openSample(page)
  const options = page.getByRole('group', { name: 'Period' }).locator('.segmented-control__option')
  // Each segment's full name; the short label a narrow phone shows sits beside it.
  expect(
    await options.evaluateAll((elements) =>
      elements.map((el) => (el.querySelector('.segmented-control__full') ?? el).textContent),
    ),
  ).toEqual(['6 weeks', '12 weeks', '6 months', '12 months', 'All time', 'Custom'])
  // Six segments with short labels fit one row at 390 px, and never overflow the page.
  await expect(options).toHaveCount(6)
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

test('at 320 px the six periods are short labels on one row, still named in full, with no sideways scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  await openSample(page)
  const period = page.getByRole('group', { name: 'Period' })
  const options = period.locator('.segmented-control__option')
  await expect(options.locator('[aria-hidden="true"]:visible')).toHaveText([
    '6 wk',
    '12 wk',
    '6 mo',
    '12 mo',
    'All',
  ])
  await expect(options.last()).toHaveText('Custom')
  for (const name of ['6 weeks', '12 weeks', '6 months', '12 months', 'All time', 'Custom']) {
    await expect(period.getByRole('radio', { name, exact: true })).toHaveCount(1)
  }
  const boxes = await options.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect()
      return { top: Math.round(box.top), left: box.left, right: box.right }
    }),
  )
  expect(new Set(boxes.map((box) => box.top)).size).toBe(1)
  for (const box of boxes) {
    expect(box.left).toBeGreaterThanOrEqual(0)
    expect(box.right).toBeLessThanOrEqual(320)
  }
  const scroll = await period
    .locator('.segmented-control__options')
    .evaluate((el) => el.scrollWidth - el.clientWidth)
  expect(scroll).toBeLessThanOrEqual(0)
})

test('period labels remain clickable at a narrow viewport with enlarged text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await openSample(page)
  await page.addStyleTag({ content: ':root { font-size: 20px; }' })
  const period = page.getByRole('group', { name: 'Period' })
  await period.getByText('6 wk', { exact: true }).click()
  // The count is in the sport page's Details, one press down.
  const runs = async () => {
    await goTo(page, 'Run')
    await page.locator('.sport-page__head .page-details > summary').click()
    return page.locator('.sport-page__head .props__row', { hasText: /^Runs/ }).locator('dd')
  }
  await expect(await runs()).toHaveText(/^\d+ of \d+$/)
  await goTo(page, 'Balance')
  await period.getByText('All', { exact: true }).click()
  // The row gives the whole count once the pick is answered; a slow runner can still be applying it.
  await expect(await runs()).toHaveText(/^\d+$/)
  await expect(await activitiesRows(page)).toHaveCount(LIST_PAGE_SIZE)
})

test('Method says that both best efforts were hard efforts', async ({ page }) => {
  await openSample(page)
  // The sample's best 20 minute efforts both reach 90% of their max heart rate. Neither tile carries a chip, the run's
  // detail says nothing of heart rate, and the method page says they reached the hard line.
  await expect(page.getByRole('button', { name: 'Hard effort', exact: true })).toHaveCount(0)
  const run = page.getByRole('article', { name: 'Half-marathon' })
  await run.locator('summary', { hasText: 'Details for half-marathon' }).click()
  await expect(run.locator('.props__row', { hasText: /^Runs used/ }).locator('dd')).toHaveText(
    /^\d+$/,
  )
  // The sample's hard runs give a half-marathon forecast, so the row leads with it and the pace is one tap down.
  await expect(run.locator('.props__row', { hasText: /^Threshold pace/ }).locator('dd')).toHaveText(
    /^\d+:\d{2} \/(km|mi)$/,
  )
  await expect(run.locator('.props')).not.toContainText(/heart rate/i)

  await openMethod(page)
  await expect(page.getByText(/Both best efforts reached at least 90% of each sport/)).toBeVisible()
})

test('the ride threshold says what it rests on, and opens its range and method one tap down', async ({
  page,
}) => {
  await openSample(page)
  const ride = page.getByRole('article', { name: 'Functional threshold power' })
  await expect(ride.locator('.stat-tile__number')).toBeVisible()
  // One number, named by its words: no chip and no range shape beside it.
  await expect(ride.getByText(/Estimated|At least/)).toHaveCount(0)
  await expect(ride.locator('.chip')).toHaveCount(0)
  // What it rests on is the first line of its one disclosure, not a line under the figure.
  await expect(ride.locator('.props__row', { hasText: /^Rides used/ })).toBeHidden()
  // The two tiles' terms are told apart by the threshold each opens.
  const term = ride.locator('summary', { hasText: 'Details for threshold power' })
  await term.click()
  const panel = ride.locator('.props')
  await expect(panel).toBeVisible()
  await expect(panel.locator('.props__row', { hasText: /^Rides used/ }).locator('dd')).toHaveText(
    /^\d+$/,
  )
  await expect(panel.locator('.props__row', { hasText: /^Range/ }).locator('dd')).toHaveText(
    /^\d+\u2013\d+ W$/,
  )
  await expect(panel.locator('.props__row', { hasText: /^Heart rate/ }).locator('dd')).toHaveText(
    /^(Raised it, from \d+ efforts?|Read, no change, from \d+ efforts?|Not used)$/,
  )
  await expect(
    page
      .getByRole('article', { name: 'Half-marathon' })
      .locator('summary', { hasText: 'Details for half-marathon' }),
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
