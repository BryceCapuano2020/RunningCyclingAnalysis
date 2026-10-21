/// <reference lib="dom" />
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

/** Hard-coded text from the landing page; the test suite checks it, so change both together. */
export const LANDING_TITLE = 'Are you a stronger runner or cyclist?'

export const WCAG_TAGS = ['wcag2a', 'wcag2aa']

/** The Activities table only. Chart "View as table" tables are also role=table. */
export function activitiesRows(page: Page): Locator {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Activities', exact: true }) })
    .getByRole('table')
    .locator('tbody tr:not([hidden])')
}

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/', import.meta.url))

export function fixturePath(name: string): string {
  return join(FIXTURE_DIR, name)
}

/** Collects console errors and uncaught page errors. Attach before navigating. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

export async function openSample(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: 'Try sample data' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/running|cycling/i)
}

/** Sends files to the hidden file input. Works from the landing page and the results page. */
export async function uploadFixtures(page: Page, names: string[]): Promise<void> {
  await page.locator('input[type="file"]').first().setInputFiles(names.map(fixturePath))
}

export async function horizontalOverflow(
  page: Page,
): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
}
