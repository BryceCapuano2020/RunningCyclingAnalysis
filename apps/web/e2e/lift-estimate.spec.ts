import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { reflowProblems } from './a11yProbes.js'
import { WCAG_TAGS, appSettled } from './helpers.js'

/** Logs one set of the open day: the lift by its typed name, then reps, load and effort. */
async function logSet(page: Page, load: string): Promise<void> {
  await page.getByRole('button', { name: 'Log a set' }).click()
  await page.getByRole('combobox', { name: 'Lift' }).fill('back squat')
  await page.getByRole('option', { name: 'Back squat', exact: true }).click()
  await page.getByLabel('Reps').fill('5')
  await page.getByLabel('Load', { exact: true }).fill(load)
  await page.getByLabel('Effort (RPE)').selectOption('8')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Done' }).click()
}

/** Three signed-out sessions on three days, which gives one lift an estimate, a line and a week of load. */
async function logThreeDays(page: Page): Promise<void> {
  await page.goto('/#/lift')
  await appSettled(page)
  await logSet(page, '100')
  await page.getByRole('button', { name: 'Earlier day' }).click()
  await logSet(page, '95')
  await page.getByRole('button', { name: 'Earlier day' }).click()
  await logSet(page, '90')
}

test('the Lift page leads with the estimate, graphs it, and has no accessibility violations', async ({
  page,
}) => {
  await logThreeDays(page)
  // A squat leads as one of the big three: its one-rep max and age grade, beside the two not logged yet.
  await expect(page.getByTestId('big-three-squat')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log a bench' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'One-rep max by lift' })).toBeVisible()
  await expect(page.locator('[data-testid="lift-point"]')).toHaveCount(3)
  await page
    .locator('.lift__estimate details.disclosure > summary')
    .filter({ hasText: 'Details' })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Rep bests' })).toBeVisible()
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(
    violations.map((v) => ({ rule: v.id, targets: v.nodes.map((n) => n.target.join(' ')) })),
  ).toEqual([])
})

test('the Lift page does not scroll sideways at 320 px', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'narrow-320', 'Only the 320 px project measures it')
  await logThreeDays(page)
  await expect(page.getByTestId('big-three-squat')).toBeVisible()
  const { overflow, clipped } = await reflowProblems(page)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(clipped).toEqual([])
})
