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

/** Opens one section's "Show the evidence" disclosure on How sure is this?, so its chart is captured. */
async function showEvidence(page: Page, section: string): Promise<void> {
  await page.locator('summary', { hasText: `Show the evidence for the ${section}` }).click()
}

/** The section whose own level 2 heading has this name. */
function sectionWith(page: Page, heading: string): Locator {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { level: 2, name: heading, exact: true }) })
}

/** The Balance answer and the two sport cards, with the evidence between them. */
function balanceTargets(page: Page): Locator[] {
  return [page.locator('.balance-hero'), page.locator('.balance__sports')]
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

/** Opens a fresh context on the app's first page, runs the job, then closes the context. */
async function withPage(
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
    await job(page)
  } finally {
    await context.close()
  }
}

/** Waits for the fonts, and keeps the pointer away from the charts so no tooltip is captured. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.mouse.move(0, 0)
}

/** Loads the sample athlete and waits for the Balance page to show its cards. */
async function openSample(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'See a sample athlete' }).click()
  await page
    .getByRole('heading', { level: 2, name: 'Your bike on foot, at every duration' })
    .waitFor()
  await settle(page)
}

/** Opens a page from the Sections navigation and waits for its heading. */
async function openSection(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link', { name, exact: true })
    .click()
  await page.getByRole('heading', { level: 1, name, exact: true }).waitFor()
  await settle(page)
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
    await withPage(browser, DESKTOP, 'light', async (page) => {
      await page.getByRole('heading', { level: 1 }).waitFor()
      await settle(page)
      await capture(
        page,
        [page.locator('.app__pitch'), page.locator('.landing__start')],
        'screenshot-landing.png',
      )
    })
    await withPage(browser, DESKTOP, 'light', async (page) => {
      await openSample(page)
      await capture(page, balanceTargets(page), 'screenshot-light.png')
      await page.getByRole('link', { name: 'How sure is this?' }).click()
      await page.getByRole('heading', { level: 1, name: 'How sure is this?' }).waitFor()
      await showEvidence(page, 'heart-rate check')
      await showEvidence(page, 'virtual power meter')
      await settle(page)
      await capture(
        page,
        [sectionWith(page, 'Heart-rate check'), sectionWith(page, 'Virtual power meter accuracy')],
        'screenshot-checks.png',
      )
      await openSection(page, 'Run')
      await capture(
        page,
        [page.locator('.page-head'), sectionWith(page, 'Every duration')],
        'screenshot-run.png',
      )
      await openSection(page, 'Activities')
      await capture(
        page,
        [page.locator('.page-head'), page.locator('.activity-list')],
        'screenshot-activities.png',
      )
    })
    await withPage(browser, DESKTOP, 'dark', async (page) => {
      await openSample(page)
      await capture(page, balanceTargets(page), 'screenshot-dark.png')
    })
    await withPage(browser, MOBILE, 'light', async (page) => {
      await openSample(page)
      await capture(page, [page.locator('.balance-hero')], 'screenshot-mobile.png')
    })
    await withPage(browser, MOBILE, 'dark', async (page) => {
      await openSample(page)
      await capture(page, [page.locator('.balance-hero')], 'screenshot-mobile-dark.png')
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
