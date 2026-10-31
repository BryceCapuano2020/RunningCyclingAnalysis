import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { encodeFit } from '@rca/core/fit'
import { sampleDataset } from '@rca/core/synthetic'
import { appSettled, completeSetup, importSummaryShown } from './helpers.js'

/**
 * The memory a big import takes in a phone-sized browser (RCA-054, D8.4). The audit measured a real export peaking near
 * 1 GiB in the browser (about 2,000 activities), with phones untested; a phone tab is killed from about that size.
 *
 * What is measured, and why. The peak resident set of the renderer process (the page and its workers share it) while
 * a library of synthetic runs and rides is imported, read from the operating system with `ps`, the process found
 * through the browser's own `SystemInfo.getProcessInfo`. It is the figure a phone's memory manager acts on, and it
 * includes what a JS heap number leaves out: the typed arrays of every activity's streams, the zip in memory and
 * WebAssembly. The alternatives do not serve:
 *  - `performance.measureUserAgentSpecificMemory()` needs a cross-origin isolated page (COEP), which this app
 *    deliberately is not (it embeds nothing, and isolation is not worth its constraints); and it is Chromium only.
 *  - `performance.memory` and CDP `Runtime.getHeapUsage` report one isolate each: the import runs in a worker,
 *    whose heap the page's does not include, and neither sees array buffers held outside the heap.
 *  - WebKit (the `mobile-webkit` project) offers no memory API at all, so it cannot be measured. The Pixel 7
 *    Chromium project runs the same V8 and the same worker code, so it stands for a phone here; what a phone
 *    changes is how much it lets a tab keep, not how much the code allocates.
 *
 * The renderer is started with a V8 old-space cap, as a small device's heap is. The cap is not an out-of-memory test
 * (the typed arrays live off the heap, and 48 MiB passes as well as 768): it makes the collector run as it does
 * there. Without it a desktop Chromium lets garbage pile up, and the same import reads 2.5 MiB an activity, which is
 * V8 being lazy and not what the import needs; with it, 0.35 to 0.39 MiB an activity (three runs of 560), which puts the
 * audit's 2,000 activities at about 0.9 GiB, where the audit measured about 1 GiB.
 *
 * The budgets are about 1.5 times the worst of those runs, a bound on growth over the idle page in all and per
 * activity. A change that makes an activity cost more memory fails here, in CI, before it fails a phone.
 */

/** A phone's heap is smaller than a desktop's: the renderer collects early, and what is measured is what the import keeps. */
test.use({ launchOptions: { args: ['--js-flags=--max-old-space-size=768'] } })

const ACTIVITIES = 560
/** The most the renderer may hold above its idle size at the peak of the import, in MiB (measured 198 to 218). */
const PEAK_GROWTH_BUDGET_MIB = 320
/** And the most each activity may add to it, in MiB (measured 0.35 to 0.39; at this rate 2,000 activities stay near 1 GiB). */
const PER_ACTIVITY_BUDGET_MIB = 0.55

/**
 * Synthetic runs and rides as FIT files in a temporary directory: the sample season repeated back in time, each a
 * distinct start. Files are passed by path, so the test's own memory is not the page's.
 */
function syntheticFiles(count: number, directory: string): string[] {
  const season = sampleDataset().activities
  return Array.from({ length: count }, (_, i) => {
    const base = season[i % season.length]!
    const set = Math.floor(i / season.length)
    const shift = set * 60 * 86_400_000 + set * 7_000
    const activity = { ...base, id: `memory-${i}`, startMs: base.startMs - shift }
    const path = join(directory, `memory-${i}.fit`)
    writeFileSync(path, encodeFit(activity, { gps: true }))
    return path
  })
}

/** The pid of the page's renderer process, from the browser's own process list. */
async function rendererPids(browser: Browser): Promise<number[]> {
  const session = await browser.newBrowserCDPSession()
  try {
    const { processInfo } = (await session.send('SystemInfo.getProcessInfo')) as {
      processInfo: { type: string; id: number }[]
    }
    return processInfo.filter(({ type }) => type === 'renderer').map(({ id }) => id)
  } finally {
    await session.detach()
  }
}

/** The resident set of the largest renderer, in MiB. */
async function renderersMiB(browser: Browser): Promise<number> {
  const sizes = (await rendererPids(browser)).map((pid) => {
    try {
      return (
        Number(
          execFileSync('ps', ['-o', 'rss=', '-p', String(pid)])
            .toString()
            .trim(),
        ) / 1024
      )
    } catch {
      return 0
    }
  })
  return Math.max(0, ...sizes)
}

test.describe('a large import on a phone-sized browser', () => {
  test.setTimeout(240_000)

  test(`takes at most ${PEAK_GROWTH_BUDGET_MIB} MiB above the idle page, ${PER_ACTIVITY_BUDGET_MIB} MiB an activity, for ${ACTIVITIES} activities`, async ({
    page,
    browser,
    browserName,
  }, testInfo) => {
    test.skip(
      browserName !== 'chromium' || testInfo.project.name !== 'mobile',
      'Measured on the Pixel 7 Chromium project: WebKit has no memory API (see the note above).',
    )
    test.skip(process.platform === 'win32', 'The resident set is read with ps.')
    const directory = mkdtempSync(join(tmpdir(), 'rca-phone-memory-'))
    const files = syntheticFiles(ACTIVITIES, directory)
    await page.goto('/')
    await appSettled(page)
    const idle = await renderersMiB(browser)

    let peak = idle
    const sampler = setInterval(() => {
      void renderersMiB(browser).then((size) => {
        peak = Math.max(peak, size)
      })
    }, 250)
    try {
      await page.locator('input[type="file"]').first().setInputFiles(files)
      await completeSetup(page)
      // "Added 120 runs and 160 rides, from ...": every file is a workout of its own.
      await importSummaryShown(page, /^Added \d+ runs? and \d+ rides?/, 180_000)
    } finally {
      clearInterval(sampler)
      rmSync(directory, { recursive: true, force: true })
    }
    peak = Math.max(peak, await renderersMiB(browser))

    const growth = peak - idle
    const perActivity = growth / ACTIVITIES
    const owner = idle + perActivity * 2_000
    console.log(
      `phone memory: idle ${idle.toFixed(0)} MiB, peak ${peak.toFixed(0)} MiB, growth ${growth.toFixed(0)} MiB, ${perActivity.toFixed(2)} MiB an activity`,
    )
    testInfo.annotations.push({
      type: 'memory',
      description: `idle ${idle.toFixed(0)} MiB, peak ${peak.toFixed(0)} MiB, ${perActivity.toFixed(2)} MiB an activity, 2,000 activities would peak near ${owner.toFixed(0)} MiB`,
    })
    expect(
      growth,
      `peak growth in MiB; ${testInfo.annotations.at(-1)?.description}`,
    ).toBeLessThanOrEqual(PEAK_GROWTH_BUDGET_MIB)
    expect(
      perActivity,
      `MiB an activity; 2,000 activities would peak near ${owner.toFixed(0)} MiB`,
    ).toBeLessThanOrEqual(PER_ACTIVITY_BUDGET_MIB)
    await expectPageAlive(page)
  })
})

/** The page still answers: an import that took the renderer to its limit would have left a crashed tab. */
async function expectPageAlive(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}
