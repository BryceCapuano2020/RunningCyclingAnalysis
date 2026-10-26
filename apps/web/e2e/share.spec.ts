import { readFileSync, statSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { horizontalOverflow, openSample } from './helpers.js'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const NOTE = 'Made on this device. Nothing is uploaded.'
const SHEET = 'Share image'
const FILE_NAME = /^balance-.*-square\.png$/

/** The shape the sheet offers, the file it saves, and the pixel size the PNG must have. */
const SHAPES = [
  { choice: 'Square (feed)', file: FILE_NAME, width: 1080, height: 1080 },
  { choice: 'Tall (story)', file: /^balance-.*-story\.png$/, width: 1080, height: 1920 },
]

/** Opens the share sheet from the Balance page, where the share button sits beside the answer. */
async function openSheet(page: Page) {
  await page.getByRole('button', { name: 'Share image' }).click()
  const sheet = page.getByRole('dialog', { name: SHEET })
  await expect(sheet).toBeVisible()
  return sheet
}

for (const { choice, file, width, height } of SHAPES) {
  test(`sample data saves a ${width} by ${height} PNG of the balance from the sheet as ${choice}`, async ({
    page,
  }, testInfo) => {
    // A touch device offers the share sheet instead; without one, the image is downloaded.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    })
    await openSample(page)
    const sheet = await openSheet(page)
    await expect(sheet.getByText(NOTE)).toBeVisible()
    await sheet.getByText(choice, { exact: true }).click()
    const preview = sheet.getByRole('img', { name: /^Preview of the/ })
    await expect(preview).toBeVisible()
    // A picture the browser cannot load is still a visible broken image, so check that it decoded.
    await expect
      .poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)

    const downloaded = page.waitForEvent('download')
    await sheet.getByRole('button', { name: 'Save image' }).click()
    const download = await downloaded
    expect(download.suggestedFilename()).toMatch(file)

    const path = await download.path()
    // Kept with the test output so the picture can be looked at after the run.
    await download.saveAs(testInfo.outputPath(download.suggestedFilename()))
    expect(statSync(path).size).toBeGreaterThan(10 * 1024)
    const png = readFileSync(path)
    expect(png.subarray(0, PNG_SIGNATURE.length)).toEqual(PNG_SIGNATURE)
    // The IHDR chunk follows the signature: width and height, as 32-bit big-endian numbers.
    expect(png.toString('ascii', 12, 16)).toBe('IHDR')
    expect(png.readUInt32BE(16)).toBe(width)
    expect(png.readUInt32BE(20)).toBe(height)
    await expect(sheet.getByRole('status').filter({ hasText: 'image saved' })).toBeVisible()
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
  const sheet = await openSheet(page)
  await sheet.getByRole('button', { name: 'Share file' }).click()
  await expect(sheet.getByRole('status').filter({ hasText: 'shared' })).toBeVisible()
  const shared = await page.evaluate(
    () => (window as unknown as { sharedFiles: unknown }).sharedFiles,
  )
  expect(shared).toEqual([{ name: expect.stringMatching(FILE_NAME), type: 'image/png' }])
})

test('the share button and its sheet fit a 320 px screen without horizontal scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await openSample(page)
  await openSheet(page)
  const results = await horizontalOverflow(page)
  expect(results.scrollWidth).toBeLessThanOrEqual(results.innerWidth)
})
