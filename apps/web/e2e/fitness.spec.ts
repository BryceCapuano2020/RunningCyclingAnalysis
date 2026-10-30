import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { edgesOf, goTo, openSample, trackErrors } from './helpers.js'

const CARD = '.fitness-card'
const CHART = /^Pace at \d+ bpm over time$/

/** A line's words as read, without the notes its defined terms keep in the markup. */
const spoken = (line: Locator) =>
  line.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement
    copy.querySelectorAll('.definition__note').forEach((note) => note.remove())
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
  })

/** The sample's fitness card, on the page the test is on. */
const card = (page: Page) => page.locator(CARD)

test('the sample leads Balance with a fitness status that is new, with its range and the runs behind it', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)
  await expect(page.getByRole('region', { name: 'Your fitness' })).toBeVisible()
  await expect(card(page).getByRole('heading', { level: 3 })).toHaveText('Slipping')
  // The words: the heart rate it is read at, the size with its 90% range, and the evidence behind it.
  expect(await spoken(card(page).locator('.fitness-card__headline'))).toMatch(
    /^At \d+ bpm you now run \d+:\d{2}\s\/(km|mi), [\d.]+% \(\d+ to \d+%\) slower than the \d+:\d{2}\s\/(km|mi) before \d{1,2} [A-Z][a-z]{2}\.$/,
  )
  expect(await spoken(card(page).locator('.fitness-card__support'))).toMatch(
    /steady runs, .* against \d+ in the/,
  )
  await expect(page.getByTestId('fitness-new')).toHaveText(/^Newweek of \d{1,2} [A-Z][a-z]{2}$/)
  // The state is a shape as well as a word, and the change is a track: both drawn, both hidden from a screen reader.
  await expect(card(page).locator('.fitness-glyph')).toHaveAttribute('aria-hidden', 'true')
  await expect(card(page).locator('.fitness-track__band')).toBeVisible()
  await expect(card(page).locator('.fitness-track__ring')).toBeVisible()
  expect(errors).toEqual([])
})

test('See the evidence opens a chart with its table twin, the method, the limit once and the runs as links', async ({
  page,
}) => {
  await openSample(page)
  // Closed, the panel draws and measures nothing.
  await expect(page.getByRole('figure', { name: CHART })).toHaveCount(0)
  await page.getByText('See the evidence').click()
  const chart = page.getByRole('figure', { name: CHART })
  await expect(chart).toBeVisible()
  // The chart: a ring and a range for each four-week step, the line it is read against, the month it began, and now.
  expect(await chart.locator('[data-testid="fitness-point"]').count()).toBeGreaterThanOrEqual(7)
  await expect(chart.locator('[data-testid="fitness-now"]')).toHaveCount(1)
  await expect(chart.locator('[data-annotation="before"]')).toContainText(/^Before /)
  await expect(chart.locator('[data-testid="fitness-onset"]')).toContainText(/^Began /)
  // Its table twin has a row for each step.
  const steps = await chart.locator('[data-testid="fitness-point"]').count()
  await chart.getByText('View as table').click()
  await expect(chart.locator('table').nth(1).locator('tbody tr')).toHaveCount(steps + 1)
  // The method and the honest limit, said once; and why some runs do not count.
  const panel = page.locator('.fitness-evidence')
  await expect(panel.getByRole('heading', { name: 'How it is measured' })).toBeVisible()
  await expect(panel).toContainText('a change of about 5% or more, within weeks to a few months')
  expect(await panel.getByText(/about 5% or more/).count()).toBe(1)
  await expect(panel.getByRole('heading', { name: /^Why some runs do not count$/ })).toBeVisible()
  // The runs it rests on are links to their activities, newest first.
  const links = panel.locator('.fitness-runs a')
  expect(await links.count()).toBeGreaterThanOrEqual(6)
  const first = links.first()
  const href = await first.getAttribute('href')
  expect(href).toMatch(/^#\/activities\//)
  await first.click()
  await expect(page).toHaveURL(new RegExp(`${href!.replace('#', '#')}$`))
  await expect(page.getByRole('link', { name: /^Back to/ })).toBeVisible()
})

test('a keyboard reaches the disclosure, opens it with Enter and reads the chart with the arrow keys', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Keyboard reading is checked on the desktop project',
  )
  await openSample(page)
  const summary = page.locator('.fitness-card__evidence > summary')
  await summary.focus()
  await expect(summary).toBeFocused()
  await page.keyboard.press('Enter')
  const chart = page.getByRole('figure', { name: CHART })
  await expect(chart).toBeVisible()
  const plot = chart.locator('.plot-surface')
  await plot.focus()
  await page.keyboard.press('ArrowRight')
  await expect(chart.locator('.chart-tooltip__title')).toContainText(/^Four weeks to /)
  await expect(chart.locator('.chart-tooltip')).toContainText(/90% range .* to .*; \d+ steady runs/)
})

test('the terms that carry the answer are defined in place: the heart rate, the range and a steady run', async ({
  page,
}) => {
  await openSample(page)
  // Each is pressed with the keyboard: a term that wraps over two lines has no one point to click, and on a phone
  // its note is a sheet at the window's foot that covers the terms below it until it is closed.
  const terms: [Locator, RegExp][] = [
    [card(page).getByRole('button', { name: /^At \d+ bpm$/ }), /one heart rate, \d+ bpm/],
    [card(page).getByRole('button', { name: /^\(\d+ to \d+%\)$/ }), /nine times out of ten/],
    [
      card(page).getByRole('button', { name: 'steady runs' }),
      /Intervals, hilly runs and treadmill runs do not count/,
    ],
  ]
  for (const [term, meaning] of terms) {
    await term.focus()
    await page.keyboard.press('Enter')
    await expect(term).toHaveAttribute('aria-expanded', 'true')
    await expect(card(page).getByRole('note').filter({ hasText: meaning })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(term).toHaveAttribute('aria-expanded', 'false')
  }
})

test('the Run page leads with the same status above the threshold, and the Ride page says nothing about it', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Run')
  await expect(page.getByRole('region', { name: 'Your fitness' })).toBeVisible()
  await expect(card(page).getByRole('heading', { level: 3 })).toHaveText('Slipping')
  // Above the threshold, and the sport is not named twice.
  const fitness = await edgesOf(card(page))
  const threshold = await edgesOf(page.getByRole('heading', { level: 2, name: /^Threshold pace/ }))
  expect(fitness.bottom).toBeLessThanOrEqual(threshold.top)
  await expect(card(page).locator('.fitness-card__sport')).toHaveCount(0)
  // The heading's own page title comes first.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Run')
  await goTo(page, 'Ride')
  await expect(page.getByRole('region', { name: 'Your fitness' })).toHaveCount(0)
})

test('the landing page’s example leads with the same finding for the sample athlete', async ({
  page,
}) => {
  await page.goto('/')
  const example = page.locator('.landing-example')
  await expect(example.locator('.landing-example__state')).toHaveText('Slipping')
  await expect(example.locator('.landing-example__sentence')).toHaveText(
    /^At 130 bpm you now run [\d.]+% \(\d+ to \d+%\) slower than before\.$/,
  )
  await expect(example.locator('.fitness-track__band')).toBeVisible()
})

test('a forced-colours reader still sees the card’s edges and the track, and reduced motion draws nothing that moves', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Media emulation is checked on the desktop project',
  )
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  await openSample(page)
  const edge = await card(page).evaluate((el) => getComputedStyle(el, '::before').backgroundColor)
  expect(edge).not.toBe('rgba(0, 0, 0, 0)')
  const bar = await card(page)
    .locator('.fitness-track__bar')
    .evaluate((el) => getComputedStyle(el).borderTopWidth)
  expect(bar).toBe('1px')
  const motion = await card(page).evaluate((el) =>
    [el, ...el.querySelectorAll('*')].map((node) => getComputedStyle(node).animationName),
  )
  expect(motion.every((name) => name === 'none')).toBe(true)
})
