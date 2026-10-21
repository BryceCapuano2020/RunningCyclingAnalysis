// Regenerates the README screenshots in docs/ from the production build in dist/.
// Usage: npm run screenshots (the script builds first, then runs this file).
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import type { Browser, Locator, Page } from '@playwright/test'
import { preview } from 'vite'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
// Screenshots live in the repository-level docs/ so the README can reference them.
const DOCS_DIR = fileURLToPath(new URL('../../../docs/', import.meta.url))
const PORT = 4321
const BASE_URL = `http://localhost:${PORT}/`
/** Space kept around the captured cards, in CSS pixels. */
const PADDING = 24
/** Retina-sharp output. Lower this to 1.5 if a PNG grows past 600 kB. */
const SCALE = 2
const DESKTOP = { width: 1280, height: 800 }
const MOBILE = { width: 390, height: 844 }

type ColorScheme = 'light' | 'dark'

interface Box {
  x: number
  y: number
  width: number
  height: number
}

function headlineCard(page: Page): Locator {
  return page.locator('section.card').filter({ has: page.locator('.headline') })
}

function bestEffortsCard(page: Page): Locator {
  return page
    .locator('section.card')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Best efforts in one unit' }) })
}

function checksRow(page: Page): Locator {
  return page
    .locator('.grid-2')
    .filter({ has: page.getByRole('heading', { level: 2, name: 'Heart-rate check' }) })
}

/** Smallest box around all targets, grown by PADDING and kept inside the viewport. */
async function paddedClip(page: Page, targets: Locator[]): Promise<Box> {
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('Page has no viewport')
  const boxes: Box[] = []
  for (const target of targets) {
    const box = await target.boundingBox()
    if (!box) throw new Error('A screenshot target is not rendered')
    boxes.push(box)
  }
  const left = Math.max(0, Math.min(...boxes.map((box) => box.x)) - PADDING)
  const top = Math.max(0, Math.min(...boxes.map((box) => box.y)) - PADDING)
  const right = Math.min(
    viewport.width,
    Math.max(...boxes.map((box) => box.x + box.width)) + PADDING,
  )
  const bottom = Math.max(...boxes.map((box) => box.y + box.height)) + PADDING
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Saves the area around the targets. Scrolls to the top first so boxes are page coordinates. */
async function capture(page: Page, targets: Locator[], fileName: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0))
  const clip = await paddedClip(page, targets)
  await page.screenshot({
    path: join(DOCS_DIR, fileName),
    clip,
    fullPage: true,
    animations: 'disabled',
  })
}

/** Opens a fresh context on the sample data results page, runs the job, then closes the context. */
async function withSampleResults(
  browser: Browser,
  viewport: { width: number; height: number },
  colorScheme: ColorScheme,
  job: (page: Page) => Promise<void>,
): Promise<void> {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: SCALE,
    colorScheme,
  })
  try {
    const page = await context.newPage()
    await page.goto(BASE_URL)
    await page.getByRole('button', { name: 'Try sample data' }).click()
    await page.locator('#results-heading').waitFor()
    await page.getByRole('heading', { level: 2, name: 'Best efforts in one unit' }).waitFor()
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    // Keep the pointer away from the charts so no hover tooltip lands in a screenshot.
    await page.mouse.move(0, 0)
    await job(page)
  } finally {
    await context.close()
  }
}

async function main(): Promise<void> {
  mkdirSync(DOCS_DIR, { recursive: true })
  const server = await preview({
    root: ROOT,
    logLevel: 'warn',
    preview: { port: PORT, strictPort: true },
  })
  let browser: Browser | undefined
  try {
    browser = await chromium.launch()
    await withSampleResults(browser, DESKTOP, 'light', async (page) => {
      await capture(page, [headlineCard(page), bestEffortsCard(page)], 'screenshot-light.png')
      await capture(page, [checksRow(page)], 'screenshot-checks.png')
    })
    await withSampleResults(browser, DESKTOP, 'dark', async (page) => {
      await capture(page, [headlineCard(page), bestEffortsCard(page)], 'screenshot-dark.png')
    })
    await withSampleResults(browser, MOBILE, 'light', async (page) => {
      await capture(page, [headlineCard(page)], 'screenshot-mobile.png')
    })
  } finally {
    await browser?.close()
    await server.close()
  }
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
