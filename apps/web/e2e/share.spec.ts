import { readFileSync, statSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { horizontalOverflow, openSample } from './helpers.js'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const NOTE = 'Creates a PNG on this device. Nothing is uploaded.'

/** The button, the file it saves, and the pixel size the PNG must have. */
const SQUARE = {
  button: 'Download square image',
  file: 'rca-summary-square.png',
  width: 1080,
  height: 1080,
}
const SHAPES = [
  SQUARE,
  { button: 'Download story image', file: 'rca-summary-story.png', width: 1080, height: 1920 },
]

for (const { button: name, file, width, height } of SHAPES) {
  test(`sample data saves a ${width} by ${height} PNG of the balance as ${file}`, async ({
    page,
  }, testInfo) => {
    // A touch device offers the share sheet instead; without one, the image is downloaded.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    })
    await openSample(page)
    const button = page.getByRole('button', { name })
    await expect(button).toHaveAccessibleDescription(NOTE)

    const downloaded = page.waitForEvent('download')
    await button.click()
    const download = await downloaded
    expect(download.suggestedFilename()).toBe(file)

    const path = await download.path()
    // Kept with the test output so the picture can be looked at after the run.
    await download.saveAs(testInfo.outputPath(file))
    expect(statSync(path).size).toBeGreaterThan(10 * 1024)
    const png = readFileSync(path)
    expect(png.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE)
    // The IHDR chunk follows the signature: width and height, as 32-bit big-endian numbers.
    expect(png.toString('ascii', 12, 16)).toBe('IHDR')
    expect(png.readUInt32BE(16)).toBe(width)
    expect(png.readUInt32BE(20)).toBe(height)
    await expect(page.getByRole('status').filter({ hasText: 'Image saved' })).toBeVisible()
  })
}

test('on a touch device the image goes to the share sheet as a PNG file', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'The share sheet is offered on touch devices only')
  await page.addInitScript(() => {
    const shared: { name: string; type: string }[] = []
    Object.assign(window, { sharedFiles: shared })
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true })
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: ShareData) => {
        for (const file of data.files ?? []) shared.push({ name: file.name, type: file.type })
      },
    })
  })
  await openSample(page)
  await page.getByRole('button', { name: SQUARE.button }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Image shared' })).toBeVisible()
  const shared = await page.evaluate(
    () => (window as unknown as { sharedFiles: unknown }).sharedFiles,
  )
  expect(shared).toEqual([{ name: SQUARE.file, type: 'image/png' }])
})

test('the download controls and their note fit a 320 px screen without horizontal scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await openSample(page)
  for (const { button } of SHAPES) {
    await expect(page.getByRole('button', { name: button })).toBeVisible()
  }
  const results = await horizontalOverflow(page)
  expect(results.scrollWidth).toBeLessThanOrEqual(results.innerWidth)
})
