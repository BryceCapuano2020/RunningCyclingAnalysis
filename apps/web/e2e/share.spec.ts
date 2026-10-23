import { readFileSync, statSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { horizontalOverflow, openSample } from './helpers.js'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const NOTE = 'Creates a PNG on this device. Nothing is uploaded.'

test('sample data saves a PNG of the comparison from the results page', async ({
  page,
}, testInfo) => {
  await openSample(page)
  const button = page.getByRole('button', { name: 'Download image' })
  await expect(button).toHaveAccessibleDescription(NOTE)

  const downloaded = page.waitForEvent('download')
  await button.click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('rca-summary.png')

  const path = await download.path()
  // Kept with the test output so the picture can be looked at after the run.
  await download.saveAs(testInfo.outputPath('rca-summary.png'))
  expect(statSync(path).size).toBeGreaterThan(10 * 1024)
  expect(readFileSync(path).subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE)
  await expect(page.getByRole('status').filter({ hasText: 'Image saved' })).toBeVisible()
})

test('the download control and its note fit a 320 px screen without horizontal scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await openSample(page)
  await expect(page.getByRole('button', { name: 'Download image' })).toBeVisible()
  const results = await horizontalOverflow(page)
  expect(results.scrollWidth).toBeLessThanOrEqual(results.innerWidth)
})
