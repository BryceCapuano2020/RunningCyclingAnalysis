import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { edgesOf, goTo, openSample, trackErrors } from './helpers.js'

const CARD = '.fitness-card[data-sport="run"]'

/** The sport pages' fitness section and its graph, titled by the sport. */
const section = (page: Page) => page.getByRole('region', { name: 'Your fitness' })
const graph = (page: Page) => section(page).getByRole('figure', { name: 'Run', exact: true })
const openRun = async (page: Page) => {
  await openSample(page)
  await goTo(page, 'Run')
}
/** Opens the Run page's one Details, which holds the level and the runs it rests on. */
const openRunDetails = (page: Page) =>
  section(page).locator('.chart-frame__details > summary').click()

/** A line's words as read, without the notes its defined terms keep in the markup. */
const spoken = (line: Locator) =>
  line.evaluate((el) => {
    const copy = el.cloneNode(true) as HTMLElement
    copy.querySelectorAll('.definition__note').forEach((note) => note.remove())
    return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
  })

/** The sample's run fitness row, on the page the test is on. */
const card = (page: Page) => page.locator(CARD)

/** Opens a fitness row's one Details, which holds the basis and the evidence. */
const openDetails = (row: Locator) => row.locator('.fitness-card__evidence > summary').click()

/** The value of the detail-panel row in `scope` whose label matches. */
async function value(scope: Locator, label: RegExp): Promise<string> {
  const row = scope
    .locator('.props__row')
    .filter({ has: scope.page().locator('dt', { hasText: label }) })
  return (await row.locator('dd').first().innerText()).replace(/\s+/g, ' ').trim()
}

test('the sample’s Balance shows the run by its sport, with its level as one line and the runs behind it in Details', async ({
  page,
}) => {
  const errors = trackErrors(page)
  await openSample(page)
  await expect(page.getByRole('region', { name: 'Your fitness' })).toBeVisible()
  await expect(card(page).locator('.fitness-card__state')).toHaveText('Run')
  // One line under the title: the level at its heart rate, with no range and no change.
  expect(await spoken(card(page).locator('.fitness-card__line'))).toMatch(
    /^\d+:\d{2} \/(km|mi) at \d+ bpm\.$/,
  )
  // The rest waits in the row's Details: the runs behind the level.
  await expect(card(page).locator('.props')).toBeHidden()
  await openDetails(card(page))
  expect(await value(card(page), /^Steady runs$/)).toMatch(/^\d+$/)
  await expect(card(page).getByTestId('fitness-season')).toHaveCount(0)
  // No state word, no change and no track anywhere on the row.
  await expect(card(page)).not.toContainText(/Slipping|Recovering|Holding|Improv|New since|\blow\b/)
  await expect(card(page).locator('.fitness-track__bar')).toHaveCount(0)
  // Balance holds no graph: that is the Run and Ride pages'.
  await expect(card(page).getByRole('figure')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the Run page draws the level as a graph with its table twin, and its Details give the method and the runs as links', async ({
  page,
}) => {
  await openRun(page)
  const chart = graph(page)
  await expect(chart).toBeVisible()
  // One disclosure for the section, closed: the evidence is not mounted yet.
  await expect(section(page).locator('details')).toHaveCount(1)
  await expect(page.locator('.fitness-evidence')).toHaveCount(0)
  // The chart: a ring and a range for each four-week step, the earlier level it is read against, and now.
  expect(await chart.locator('[data-testid="fitness-point"]').count()).toBeGreaterThanOrEqual(5)
  await expect(chart.locator('[data-testid="fitness-now"]')).toHaveCount(1)
  await expect(chart.locator('[data-annotation="before"]')).toContainText(/^Earlier level/)
  await expect(
    chart.locator('[data-testid="fitness-onset"], [data-testid="fitness-low"]'),
  ).toHaveCount(0)
  // Its table twin has a row for each step.
  const steps = await chart.locator('[data-testid="fitness-point"]').count()
  await expect(chart.locator('table').nth(1).locator('tbody tr')).toHaveCount(steps + 1)
  await openRunDetails(page)
  // What it is read at and compared with are rows; the method and the honest limit are on Method.
  const panel = page.locator('.fitness-evidence')
  expect(await value(panel, /^Read at$/)).toMatch(/^\d+ bpm$/)
  expect(await value(panel, /^Steady runs on file$/)).toMatch(/^\d+$/)
  // One Method link, for the section, above the panel.
  await expect(
    section(page).getByRole('link', { name: /how run fitness is worked out/ }),
  ).toBeVisible()
  await expect(panel.getByRole('link', { name: /^Method/ })).toHaveCount(0)
  await expect(panel.getByRole('heading', { name: 'How it is measured' })).toHaveCount(0)
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

test('a keyboard reads the Run page’s graph with the arrow keys', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Keyboard reading is checked on the desktop project',
  )
  await openRun(page)
  const chart = graph(page)
  await expect(chart).toBeVisible()
  const plot = chart.locator('.plot-surface')
  await plot.focus()
  await page.keyboard.press('ArrowRight')
  await expect(chart.locator('.chart-tooltip__title')).toContainText(
    /^The \d+ weeks to \d{1,2} [A-Z][a-z]{2}$/,
  )
  await expect(chart.locator('.chart-tooltip')).toContainText(/90% range .* to .*; \d+ steady runs/)
})

test('the Run page leads with the same status above the threshold', async ({ page }) => {
  await openSample(page)
  await goTo(page, 'Run')
  const section = page.getByRole('region', { name: 'Your fitness' })
  await expect(section).toBeVisible()
  // A graph of the level over time, titled by the sport, with today marked.
  const graph = section.getByRole('figure', { name: 'Run', exact: true })
  await expect(graph.getByTestId('fitness-now')).toBeAttached()
  // Under the hero, and the sport is not named twice.
  const fitness = await edgesOf(graph)
  const hero = await edgesOf(page.locator('.sport-hero'))
  expect(hero.bottom).toBeLessThanOrEqual(fitness.top)
  await expect(page.getByTestId('hero-change')).toBeVisible()
  // The heading's own page title comes first.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Run')
})

// The sample is a runner who took up riding this autumn, so it has too few steady rides from before the last 8 weeks to call a
// trend (see FitnessCard.test.tsx): home gives the ride a row titled by the sport alone with its level as the one line, its
// figures spaced and no link, and the Ride page holds the ride's own row, with the level, what a trend needs and no run on it.
test('Balance tells a ride that cannot call a trend as one line, and the Ride page holds its row', async ({
  page,
}) => {
  await openSample(page)
  await expect(page.locator('.fitness-card')).toHaveCount(2)
  const home = page.locator('.fitness-card[data-sport="ride"]')
  await expect(home.locator('.fitness-card__state')).toHaveText('Ride')
  const line = home.locator('.fitness-card__line')
  // The words as the eye reads them, so a collapsed space around a figure fails here.
  const homeLine = await line.evaluate((el) => (el as HTMLElement).innerText)
  expect(homeLine).toMatch(/^\d+ W at \d+ bpm\.$/)
  await expect(line.getByRole('link')).toHaveCount(0)
  await goTo(page, 'Ride')
  const ride = page.getByRole('region', { name: 'Your fitness' })
  await expect(ride).toBeVisible()
  // The steady rides it rests on as dots, today's level across them, and no trend drawn.
  const graph = ride.getByRole('figure', { name: 'Ride', exact: true })
  await expect(graph.getByTestId('fitness-dots')).toBeAttached()
  await expect(graph.getByTestId('fitness-now-mark')).toContainText(/^Now \d+ W$/)
  await ride.locator('.chart-frame__details > summary').click()
  // The Ride page's level is the figure the home page's one line printed.
  const level = await value(ride, /^Power at \d+ bpm$/)
  expect(level).toMatch(/^\d+ W$/)
  expect(homeLine).toContain(level)
  expect(await value(ride, /^Range$/)).toMatch(/^\d+ to \d+ W$/)
  expect(await value(ride, /^Trend$/)).toMatch(/^Needs \d+ more earlier rides?$/)
  await expect(page.locator('.fitness-card[data-sport="run"]')).toHaveCount(0)
})

test('the landing page’s one sample card holds the balance and no fitness finding', async ({
  page,
}) => {
  await page.goto('/')
  const example = page.locator('.landing-example')
  await expect(example).toHaveCount(1)
  await expect(example.locator('figcaption .landing-example__name')).toHaveText('Sample athlete')
  await expect(example.locator('.level-triangle')).toBeVisible()
  await expect(example).not.toContainText(/Slipping|Slower than your old level/)
  await expect(example.locator('.fitness-track__ring')).toHaveCount(0)
  // The sample's own Balance page titles the run by its sport.
  await openSample(page)
  await expect(card(page).locator('.fitness-card__state')).toHaveText('Run')
})

test('a forced-colours reader still sees the row’s hairline', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'desktop',
    'Media emulation is checked on the desktop project',
  )
  await page.emulateMedia({ forcedColors: 'active' })
  await openSample(page)
  const edge = await card(page).evaluate((el) => {
    const style = getComputedStyle(el)
    return { width: style.borderTopWidth, style: style.borderTopStyle }
  })
  expect(edge).toEqual({ width: '1px', style: 'solid' })
})

// The one thing in the evidence panel that moves is the phone's readout sheet, which opens with a short animation
// unless the reader asks for less motion. The check reads it both ways, so it cannot pass because nothing moves.
for (const [preference, animation] of [
  ['no-preference', 'chart-readout-open'],
  ['reduce', 'none'],
] as const) {
  test(`the chart's readout sheet animates for "${preference}" motion as ${animation}`, async ({
    page,
  }, testInfo) => {
    test.skip(
      !['mobile', 'mobile-webkit'].includes(testInfo.project.name),
      'The readout sheet is the phone’s',
    )
    await page.emulateMedia({ reducedMotion: preference })
    await openRun(page)
    const chart = graph(page)
    await chart.locator('.plot-surface').focus()
    await page.keyboard.press('ArrowRight')
    const title = chart.locator('.chart-tooltip__title')
    await expect(title).toContainText(/^The \d+ weeks to /)
    const sheet = chart.locator('.chart-frame__readout--compact .chart-tooltip')
    expect(await sheet.evaluate((el) => getComputedStyle(el).animationName)).toBe(animation)
  })
}

// On a phone the level's labels sit inside the plot, where the reference line's label could land on one: no two of
// the chart's texts may share ground, whatever the width.
test('no label of the evidence chart is written over another', async ({ page }) => {
  await openRun(page)
  const chart = graph(page)
  await expect(chart.locator('[data-annotation="before"]')).toBeVisible()
  const boxes = await chart.evaluate((root) => {
    const texts = [
      ...root.querySelectorAll('.chart-y-axis__tick, .chart-x-axis__tick, [data-annotation] text'),
    ]
    return texts
      .filter((t) => (t.textContent ?? '').trim() !== '')
      .map((t) => {
        const b = t.getBoundingClientRect()
        return {
          text: t.textContent ?? '',
          left: b.left,
          right: b.right,
          top: b.top,
          bottom: b.bottom,
        }
      })
  })
  expect(boxes.length).toBeGreaterThan(6)
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const apart =
        a.right <= b.left + 1 ||
        b.right <= a.left + 1 ||
        a.bottom <= b.top + 1 ||
        b.bottom <= a.top + 1
      // The level's labels are drawn twice (under the marks and over them), at the same place.
      const same = a.text === b.text && Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1
      expect(apart || same, `"${a.text}" and "${b.text}" overlap`).toBe(true)
    }
  }
})
