import { expect, test } from '@playwright/test'
import { reflowProblems } from './a11yProbes.js'
import { LANDING_TITLE, activitiesRows, goTo, openSample } from './helpers.js'

// WCAG 1.4.10 Reflow: a 320 px wide, 256 px tall window (a 1280 px page at 400% zoom) scrolls one way only.
const ONLY_REFLOW = 'Measures the 320 x 256 window'

test('the landing fits 320 x 256 and its heading and Add files stay whole', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'reflow-320x256', ONLY_REFLOW)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: LANDING_TITLE })).toBeVisible()
  const { overflow, clipped } = await reflowProblems(page)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(clipped).toEqual([])
})

test('each page of the sample fits 320 x 256', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'reflow-320x256', ONLY_REFLOW)
  await openSample(page)
  const failures: string[] = []
  await page.getByRole('main').getByRole('link', { name: 'How sure is this?' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'How sure is this?' })).toBeVisible()
  const method = await reflowProblems(page)
  if (method.overflow > 0 || method.clipped.length > 0) {
    failures.push(`Method: +${method.overflow} ${method.clipped}`)
  }
  for (const destination of ['Balance', 'Run', 'Ride', 'Activities', 'Profile'] as const) {
    await goTo(page, destination)
    const { overflow, clipped } = await reflowProblems(page)
    if (overflow > 0 || clipped.length > 0) failures.push(`${destination}: +${overflow} ${clipped}`)
  }
  const rows = await activitiesRows(page)
  await rows.first().getByRole('link').click()
  await expect(page.getByRole('slider', { name: 'Selection start' })).toBeVisible()
  const activity = await reflowProblems(page)
  if (activity.overflow > 0 || activity.clipped.length > 0) {
    failures.push(`Activity: +${activity.overflow} ${activity.clipped}`)
  }
  expect(failures).toEqual([])
})
