import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { LANDING_TITLE, WCAG_TAGS, activitiesRows, goTo, openSample } from './helpers.js'

/** One line per violation, so a failure names the rule and the elements it hit. */
async function violationsOf(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  return violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }))
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
    },
  },
  {
    name: 'How sure is this?',
    open: async (page) => {
      await openSample(page)
      await page.getByRole('link', { name: 'How sure is this?' }).click()
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
