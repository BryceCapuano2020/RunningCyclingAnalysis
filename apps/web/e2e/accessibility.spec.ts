import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import {
  LANDING_TITLE,
  WCAG_TAGS,
  activitiesRows,
  goTo,
  openSample,
  SETUP_DIALOG_NAME,
  fixturePath,
  uploadFixtures,
} from './helpers.js'

/** One line per violation, so a failure names the rule and the elements it hit. */
async function violationsOf(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  return violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }))
}

/** Opens the fitness card's evidence and waits for what is in it: its chart and the runs it rests on. */
async function openFitnessEvidence(page: Page): Promise<void> {
  await page.getByText('See the evidence').click()
  await expect(page.getByRole('figure', { name: /^Pace at \d+ bpm over time$/ })).toBeVisible()
  await expect(page.locator('.fitness-runs a').first()).toBeVisible()
}

/** Opens the sample with a year of birth and a sex saved, so the age grades and levels show. */
async function openGradedSample(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem(
      'rca.preferences.v1',
      JSON.stringify({
        settings: { massKg: 75, bikeMassKg: 9 },
        units: 'metric',
        birthYear: 1986,
        sex: 'male',
        setupDone: true,
      }),
    )
  })
  await openSample(page)
}

/**
 * Opens a sport page with a year of birth and sex saved, then every closed section, the race predictions'
 * disclosure and the definition of the assumed spread, so what sits behind them is checked too. Each press
 * is followed by its content, so nothing is checked before it is drawn.
 */
function openEverySection(sport: 'Run' | 'Ride') {
  return async (page: Page): Promise<void> => {
    await openGradedSample(page)
    await goTo(page, sport)
    // The sections are open to start with, each with its content drawn.
    const count = await page.locator('.sport-disclosure__summary').count()
    expect(count).toBeGreaterThan(0)
    await expect(page.locator('.sport-disclosure__details[open]')).toHaveCount(count)
    const about = page.getByText('About these predictions')
    if ((await about.count()) > 0) {
      await about.click()
      await expect(page.getByRole('table', { name: /Race predictions/ })).toBeVisible()
    }
  }
}

const PAGES: { name: string; open: (page: Page) => Promise<void> }[] = [
  {
    name: 'landing',
    open: async (page) => {
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
    },
  },
  { name: 'Balance', open: openSample },
  {
    name: 'Balance, the fitness evidence open',
    open: async (page) => {
      await openSample(page)
      await openFitnessEvidence(page)
    },
  },
  {
    name: 'Balance, a fitness definition open',
    open: async (page) => {
      await openSample(page)
      // By keyboard: a term that wraps over two lines has no one point to click.
      await page
        .locator('.fitness-card')
        .getByRole('button', { name: /^At \d+ bpm$/ })
        .focus()
      await page.keyboard.press('Enter')
      await expect(
        page.locator('.fitness-card[data-sport="run"] .definition__note').first(),
      ).toBeVisible()
    },
  },
  {
    name: 'Balance, a definition open',
    open: async (page) => {
      await openSample(page)
      await page.getByRole('button', { name: 'age grade', exact: true }).click()
      await expect(page.getByRole('note').first()).toBeVisible()
    },
  },
  {
    name: 'Run',
    open: async (page) => {
      await openSample(page)
      await goTo(page, 'Run')
    },
  },
  {
    name: 'Run, the fitness evidence open',
    open: async (page) => {
      await openSample(page)
      await goTo(page, 'Run')
      await openFitnessEvidence(page)
    },
  },
  {
    name: 'Run, graded',
    open: async (page) => {
      await openGradedSample(page)
      await goTo(page, 'Run')
    },
  },
  {
    name: 'Ride, graded',
    open: async (page) => {
      await openGradedSample(page)
      await goTo(page, 'Ride')
    },
  },
  {
    name: 'Run, every section open',
    open: openEverySection('Run'),
  },
  {
    name: 'Ride, every section open',
    open: openEverySection('Ride'),
  },
  {
    name: 'setup dialog',
    open: async (page) => {
      await page.goto('/')
      await page.locator('input[type="file"]').first().setInputFiles(fixturePath('one-run.fit'))
      await expect(page.getByRole('dialog', { name: SETUP_DIALOG_NAME })).toBeVisible()
    },
  },
  {
    name: 'remove activities confirmation',
    open: async (page) => {
      await page.goto('/')
      await uploadFixtures(page, ['one-run.fit'])
      await goTo(page, 'Profile')
      await page.getByRole('button', { name: 'Remove all my activities' }).click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
    },
  },
  {
    name: 'Activities',
    open: async (page) => {
      await openSample(page)
      await goTo(page, 'Activities')
    },
  },
  {
    name: 'activity',
    open: async (page) => {
      await openSample(page)
      const rows = await activitiesRows(page)
      await rows.first().getByRole('link').click()
      await expect(page.getByRole('link', { name: 'Back to activities' })).toBeVisible()
      await expect(page.getByRole('slider', { name: 'Selection start' })).toBeVisible()
    },
  },
  {
    name: 'How sure is this?',
    open: async (page) => {
      await openSample(page)
      await page.getByRole('main').getByRole('link', { name: 'How sure is this?' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'How sure is this?' })).toBeVisible()
    },
  },
  {
    name: 'Profile',
    open: async (page) => {
      await openSample(page)
      await goTo(page, 'Profile')
    },
  },
]

for (const scheme of ['light', 'dark'] as const) {
  for (const { name, open } of PAGES) {
    test(`${name} page has no WCAG 2 A/AA or best-practice violations in ${scheme} mode`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await open(page)
      expect(await violationsOf(page)).toEqual([])
    })
  }
}

test('the activity workbench fits a 320 px screen with its tables expanded', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'narrow-320', 'Measures the narrowest supported screen')
  await openSample(page)
  const rows = await activitiesRows(page)
  await rows.first().getByRole('link').click()
  await expect(page.getByRole('slider', { name: 'Selection start' })).toBeVisible()
  const workbench = page.getByRole('region', { name: 'In detail', exact: true })
  for (const summary of await workbench.locator('details > summary').all()) await summary.click()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(0)
  expect(await violationsOf(page)).toEqual([])
})

test('the level ladder labels are at least 11 px, and the page does not scroll sideways at 320 px', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'narrow-320',
    'Only the 320 px project measures the narrowest screen',
  )
  await openGradedSample(page)
  await goTo(page, 'Run')
  const sizes = await page
    .locator('.level-ladder__pct, .level-ladder__name')
    .evaluateAll((labels) => labels.map((label) => parseFloat(getComputedStyle(label).fontSize)))
  expect(sizes.length).toBeGreaterThan(0)
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

for (const sport of ['Run', 'Ride'] as const) {
  test(`${sport} with every section and disclosure open does not scroll sideways at 320 px`, async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'narrow-320',
      'Only the 320 px project measures the narrowest screen',
    )
    await openEverySection(sport)(page)
    // Every other disclosure (a chart's table, a method note) too, each followed by its open state.
    const closed = page.locator('details:not([open]) > summary')
    while ((await closed.count()) > 0) {
      const before = await page.locator('details[open]').count()
      await closed.first().click()
      await expect(page.locator('details[open]')).toHaveCount(before + 1)
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0)
    // The page can hide an overflow its own box still has, so each disclosure's content is held to its box too.
    const wider = await page.evaluate(() =>
      [...document.querySelectorAll('details > *:not(summary)')].flatMap((child) => {
        const box = child.parentElement?.getBoundingClientRect()
        const edge = child.getBoundingClientRect().right
        return box !== undefined && edge > box.right + 1
          ? [
              `${child.className || child.tagName} ends ${Math.round(edge - box.right)} px past its disclosure`,
            ]
          : []
      }),
    )
    expect(wider).toEqual([])
  })
}

test('Profile with dated settings fits 320 px, and its table is a keyboard scroll region', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'narrow-320',
    'Only the 320 px project measures the narrowest screen',
  )
  // The sample's settings are read-only, so dated settings are the visitor's own, with their own file.
  await page.goto('/')
  await uploadFixtures(page, ['one-run.fit'])
  await goTo(page, 'Profile')
  const dates = ['2026-08-15', '2025-08-15', '2026-05-01']
  for (const [index, date] of dates.entries()) {
    await page.getByLabel('Setting', { exact: true }).selectOption({ index: index === 2 ? 1 : 0 })
    await page.getByLabel(/^Value/).fill(index === 2 ? '184' : `${150 + index}`)
    await page.locator('.settings-over-time input[type="date"]').fill(date)
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(
      page
        .locator('.settings-over-time')
        .getByRole('status')
        .filter({ hasText: /^(Added|Updated)/ }),
    ).toBeVisible()
  }
  await expect(page.locator('.settings-over-time tbody tr')).toHaveCount(3)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
  // A phone's viewport can stretch to fit what overflows it, so also check that the box that scrolls
  // the table is what positions the header cells that are visually hidden, which it then clips.
  const escapes = await page.evaluate(() => {
    const box = document.querySelector('.settings-over-time .table-scroll')
    const hidden = document.querySelectorAll('.settings-over-time .table-scroll .sr-only')
    const containerOf = (el: Element) => {
      let up = el.parentElement
      while (up !== null && getComputedStyle(up).position === 'static') up = up.parentElement
      return up
    }
    return [...hidden].filter((el) => containerOf(el) !== box).length
  })
  expect(escapes).toBe(0)
  const region = page.getByRole('region', { name: 'Your dated settings' })
  await expect(region).toHaveAttribute('tabindex', '0')
  expect(await violationsOf(page)).toEqual([])
})

// The phone header keeps the brand and the actions on one row at the widths where the wordmark is
// still shown, so the tabs' bar and the header do not wrap or widen the page.
for (const width of [600, 760]) {
  test(`the phone header keeps its brand and actions on one row at ${width} px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await openSample(page)
    const brand = await page.locator('.header__brand').boundingBox()
    const actions = await page.locator('.header__actions').boundingBox()
    expect(brand).not.toBeNull()
    expect(actions).not.toBeNull()
    expect(Math.abs((brand?.y ?? 0) - (actions?.y ?? 0))).toBeLessThan(4)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

test('the sample on Profile shows its own settings read-only, and nothing is saved', async ({
  page,
}) => {
  await openSample(page)
  await goTo(page, 'Profile')

  await expect(
    page.getByText("These are the sample athlete's settings. Add your files to use your own."),
  ).toBeVisible()
  const list = page.getByRole('region', { name: 'Sample athlete' })
  // The sample is 37 on its newest effort, which is this year's.
  await expect(list.getByText(String(new Date().getFullYear() - 37))).toBeVisible()
  await expect(list.getByText('Man', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Year of birth' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Settings over time' })).toHaveCount(0)
  // The sample's zones are shown, from its own references.
  await expect(page.getByRole('table', { name: /^Run heart rate zones/ })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('rca.preferences.v1'))).toBeNull()
})

test('zone tables name themselves outside the table and fit the screen without scrolling', async ({
  page,
}, testInfo) => {
  await openSample(page)
  await goTo(page, 'Profile')
  await expect(page.locator('.zone-tables caption')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 3, name: 'Run pace zones' })).toBeVisible()
  const clipped = await page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>('.zone-tables__table')].filter(
        (box) => box.scrollWidth > box.clientWidth,
      ).length,
  )
  expect(clipped, `${testInfo.project.name} clips a zone table`).toBe(0)
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
})

test('notices sit inside main, and a page has no empty live region of its own to count', async ({
  page,
}) => {
  await openSample(page)
  const outside = await page.evaluate(
    () =>
      [...document.querySelectorAll('[role="status"],[role="alert"]')].filter(
        (node) =>
          !node.closest('main') &&
          (node.textContent ?? '').trim() !== '' &&
          !node.closest('header'),
      ).length,
  )
  expect(outside).toBe(0)
  await expect(page.getByRole('main').getByText(/^Sample athlete, a 37-year-old man/)).toBeVisible()

  // The notice region is one live region, and a notice added to it is announced from there.
  await goTo(page, 'Run')
  await expect(page.getByRole('button', { name: 'Sample athlete' })).toBeVisible()
  const regions = await page.evaluate(
    () => document.querySelectorAll('main .app__live[role="status"]').length,
  )
  expect(regions).toBe(1)
})

test('the fitness card and its evidence fit a 320 px screen, in both schemes', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'narrow-320', 'Measures the narrowest supported screen')
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await openSample(page)
    await openFitnessEvidence(page)
    await page.locator('.fitness-card[data-sport="run"]').getByText('View as table').click()
    await expect(page.locator('.fitness-card[data-sport="run"] table').first()).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(0)
    expect(await violationsOf(page)).toEqual([])
  }
})
