import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { AxeBuilder } from '@axe-core/playwright'
import { LANDING_TITLE, WCAG_TAGS, openSample } from './helpers.js'

/** One line per violation, so a failure names the rule and the elements it hit. */
async function violationsOf(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  return violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }))
}

test('landing page has no WCAG 2 A/AA violations in light mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  expect(await violationsOf(page)).toEqual([])
})

test('landing page has no WCAG 2 A/AA violations in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  expect(await violationsOf(page)).toEqual([])
})

test('results page has no WCAG 2 A/AA violations in light mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await openSample(page)
  expect(await violationsOf(page)).toEqual([])
})

test('results page has no WCAG 2 A/AA violations in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await openSample(page)
  expect(await violationsOf(page)).toEqual([])
})
