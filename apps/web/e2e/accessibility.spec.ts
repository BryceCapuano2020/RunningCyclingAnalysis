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
    name: 'Run',
    open: async (page) => {
      await openSample(page)
      await goTo(page, 'Run')
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
      await expect(
        page.getByRole('spinbutton', { name: 'Selected interval start time in seconds' }),
      ).toBeVisible()
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
    test(`${name} page has no WCAG 2 A/AA violations in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await open(page)
      expect(await violationsOf(page)).toEqual([])
    })
  }
}

test('the activity workbench fits a 320 px screen with expanded distributions', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'narrow-320', 'Measures the narrowest supported screen')
  await openSample(page)
  const rows = await activitiesRows(page)
  await rows.first().getByRole('link').click()
  await expect(
    page.getByRole('spinbutton', { name: 'Selected interval start time in seconds' }),
  ).toBeVisible()
  const workbench = page.getByRole('region', { name: 'Activity workbench', exact: true })
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
