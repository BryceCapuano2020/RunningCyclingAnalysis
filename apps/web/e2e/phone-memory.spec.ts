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
 * Two things are measured, because they answer two questions.
 *
 * What the import keeps (the sensitive one). `performance.measureUserAgentSpecificMemory()` collects garbage and then
 * counts every byte the page and its workers still reach, typed arrays included. An import that holds on to a parsed
 * activity (its streams are about 0.2 MiB each) shows at once: the figure per activity is 0.02 MiB, and a build that
 * kept every parsed activity read 0.22 (9 times over), the same in every run. The API needs a cross-origin isolated
 * page and full Chromium (not the headless shell), so this test serves its own page with the isolating headers and
 * runs on `channel: 'chromium'`; the app is not changed.
 *
 * What the browser reaches at its worst (the blunt one). The peak resident set of the renderer process, read with
 * `ps` from the pid in the browser's own `SystemInfo.getProcessInfo`, sampled while the import runs. It is the figure
 * a phone's memory manager acts on and it includes the transient copies of a parse in flight, but it moves 20 percent
 * from run to run, so it can only catch a gross change; the extrapolation to 2,000 activities is for the reader.
 *
 * Why not the others. `performance.memory` and CDP `Runtime.getHeapUsage` report one isolate each: the import runs in
 * a worker, whose heap the page's does not include, and neither sees array buffers. WebKit (the `mobile-webkit`
 * project) has no memory API at all, so it cannot be measured; the Pixel 7 Chromium project runs the same V8 and the
 * same worker code, and stands for a phone: a phone changes how much a tab may keep, not how much the code allocates.
 *
 * The renderer is started with a V8 old-space cap, as a small device's heap is. The cap is not an out-of-memory test
 * (the typed arrays live off the heap): it makes the collector run as it does there. Without it a desktop Chromium
 * lets garbage pile up and the same import reads 2.5 MiB an activity of resident set, which is V8 being lazy.
 */

/** A phone's heap is smaller than a desktop's: the renderer collects early, and what is measured is what the import keeps. */
test.use({ channel: 'chromium', launchOptions: { args: ['--js-flags=--max-old-space-size=768'] } })

const ACTIVITIES = 560
/**
 * What the import may leave reachable for each activity, in MiB. Seven runs read 0.019 to 0.024 (the spread is the idle
 * page's own, 5 or 8 MiB, over 560); the budget is 1.5 times the worst. A build that kept every parsed activity read
 * 0.219 to 0.224 in five runs, and one that kept only the speed stream of each read 0.054 in three (the peak below
 * passed all three).
 */
const RETAINED_BUDGET_MIB = 0.035
/**
 * The most the renderer may hold above its idle size at the peak of the import, in MiB. Thirteen runs read 198 to 260;
 * the build that kept every parsed activity read 341 to 389 in five. The margin is thin, which is why this is the
 * blunt check and the one above is the gate.
 */
const PEAK_GROWTH_BUDGET_MIB = 320
/** Below this a renderer is not a page that has loaded the app: the wrong process was read. */
const SANE_RENDERER_MIB = 50

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

/** The resident set of the largest renderer, in MiB. A process that cannot be read is an error, never a zero. */
async function renderersMiB(browser: Browser): Promise<number> {
  const sizes: number[] = []
  for (const pid of await rendererPids(browser)) {
    const kib = Number(
      execFileSync('ps', ['-o', 'rss=', '-p', String(pid)])
        .toString()
        .trim(),
    )
    if (!Number.isFinite(kib)) throw new Error(`ps gave no resident set for renderer ${pid}`)
    sizes.push(kib / 1024)
  }
  if (sizes.length === 0) throw new Error('the browser reported no renderer process')
  return Math.max(...sizes)
}

/** Serves this test's pages cross-origin isolated, which `measureUserAgentSpecificMemory` requires. */
async function isolate(page: Page, origin: string): Promise<void> {
  await page.route(`${origin}/**`, async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      headers: {
        ...response.headers(),
        'cross-origin-opener-policy': 'same-origin',
        'cross-origin-embedder-policy': 'credentialless',
      },
    })
  })
}

/** What the page and its workers still reach after a collection, in MiB. */
async function reachableMiB(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const measure = (
      performance as unknown as { measureUserAgentSpecificMemory(): Promise<{ bytes: number }> }
    ).measureUserAgentSpecificMemory
    return (await measure.call(performance)).bytes / 1_048_576
  })
}

test.describe('a large import on a phone-sized browser', () => {
  test.setTimeout(240_000)
  test.skip(process.platform === 'win32', 'The resident set is read with ps.')

  test(`keeps at most ${RETAINED_BUDGET_MIB} MiB an activity and peaks at most ${PEAK_GROWTH_BUDGET_MIB} MiB above idle, for ${ACTIVITIES} activities`, async ({
    page,
    browser,
    baseURL,
  }, testInfo) => {
    const directory = mkdtempSync(join(tmpdir(), 'rca-phone-memory-'))
    const files = syntheticFiles(ACTIVITIES, directory)
    await isolate(page, new URL(baseURL!).origin)
    await page.goto('/')
    await appSettled(page)
    const idleReachable = await reachableMiB(page)
    const idle = await renderersMiB(browser)
    expect(idle, 'the idle renderer, in MiB').toBeGreaterThan(SANE_RENDERER_MIB)

    let peak = idle
    // A sample that fails mid-import (a process exiting) is dropped; the reads before and after are strict.
    const sampler = setInterval(() => {
      void renderersMiB(browser)
        .then((size) => {
          peak = Math.max(peak, size)
        })
        .catch(() => undefined)
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
    const reachable = await reachableMiB(page)

    const retained = (reachable - idleReachable) / ACTIVITIES
    const growth = peak - idle
    const owner = idle + (growth / ACTIVITIES) * 2_000
    const line = `reachable ${idleReachable.toFixed(1)} to ${reachable.toFixed(1)} MiB, ${retained.toFixed(3)} MiB an activity; resident idle ${idle.toFixed(0)}, peak ${peak.toFixed(0)}, growth ${growth.toFixed(0)} MiB, 2,000 activities would peak near ${owner.toFixed(0)} MiB`
    console.log(`phone memory: ${line}`)
    testInfo.annotations.push({ type: 'memory', description: line })

    expect(
      reachable,
      'the import left nothing reachable: the page was not measured',
    ).toBeGreaterThan(idleReachable)
    expect(retained, `MiB an activity left reachable; ${line}`).toBeLessThanOrEqual(
      RETAINED_BUDGET_MIB,
    )
    expect(growth, `MiB of resident growth at the peak; ${line}`).toBeLessThanOrEqual(
      PEAK_GROWTH_BUDGET_MIB,
    )
    await expectPageAlive(page)
  })
})

/** The page still answers: an import that took the renderer to its limit would have left a crashed tab. */
async function expectPageAlive(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}
