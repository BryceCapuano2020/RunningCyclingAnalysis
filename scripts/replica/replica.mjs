#!/usr/bin/env node
/**
 * Signed-in replica: loads an RCA account download into a local Worker and writes down what every page
 * says, signed in, the way that account sees it on the live site. Run it before a release to see what a
 * real account sees, which a fresh e2e account cannot show.
 *
 * PRIVATE DATA. A real account download (Profile > "Download my data") holds real activity data, and so
 * does everything this tool writes (page text, screenshots, the local database). Keep the download and
 * the output outside git and out of pull requests, issues and chat. Only synthetic downloads, such as the
 * one scripts/replica/synth-download.mjs writes, may be shared.
 *
 *   node scripts/replica/replica.mjs <download.json> [--out <dir>] [--checkout <dir>]
 *
 *   <download.json>   the account download (JSON, format "rca-export").
 *   --out <dir>       where the output goes. Default: .replica-out/ in the checkout this script lives in,
 *                     which git ignores. A folder inside any git work tree is refused unless git ignores it.
 *   --checkout <dir>  a checkout whose apps/web/dist is built (`npm ci && npm run build` there).
 *                     Default: the checkout this script lives in.
 *   -h, --help        this text.
 *
 * Environment:
 *   RCA_TESTSLOT      optional path of any wrapper script that runs its arguments once a machine-wide test
 *                     slot is free. When set, this script re-runs under it. None ships in the repository.
 *
 * Exit codes: 0 the run finished; 1 the run failed, or the API refused any activity or loaded none
 * (whatever was written is still in the output folder); 2 bad usage or a missing input (no build, no
 * download, not an RCA download, an output folder git would track); 128 plus the signal number when
 * stopped by SIGINT, SIGTERM or SIGHUP, after the browser and the Worker have been stopped.
 *
 * What it does:
 *   1. starts `wrangler dev` from <checkout>/apps/api on a free port, with a fresh local D1 in <out>/.state,
 *      serving the built web app and /api together (ENVIRONMENT=development, so dev-login is on);
 *   2. signs in through dev-login as replica@example.test, then writes the download's profile, dated
 *      measurements and every activity digest through the real API;
 *   3. opens the app signed in (all other network blocked) and, for the default period and each period,
 *      writes <page>-<period>.txt for balance, run, ride, history, activities and profile, plus
 *      <page>-default.png and <page>-all-time.png;
 *   4. writes seed.json (what was loaded and refused), console.txt, counts.tsv, withheld.txt, run.json.
 *
 * Compare the text with scripts/replica/truth-check.mjs.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { PAGES, PERIODS, goToPage, mainText, pickPeriod, settle } from './drive.mjs'
import { createReport, refusalCounts, seedProblem } from './report.mjs'
import { SIGNALS, outDirProblem, runInGroup, signalExitCode } from './run.mjs'
import { freePort, seedAccount, startWorker, stopWorker } from './worker.mjs'

const USAGE = `usage: node scripts/replica/replica.mjs <download.json> [--out <dir>] [--checkout <dir>]
Loads an RCA account download into a local Worker and writes what every page says, signed in.
The download and the output hold real data: keep both outside git. See scripts/replica/README.md.`

const OWN_CHECKOUT = fileURLToPath(new URL('../../', import.meta.url))
const ACCOUNT = { email: 'replica@example.test', name: 'Replica' }
const VIEWPORT = { width: 1280, height: 900 }
/** How long Chromium gets to close before this process exits, which kills it. */
const BROWSER_CLOSE_TIMEOUT_MS = 10_000

function usageError(message) {
  if (message) console.error(message)
  console.error(USAGE)
  process.exit(2)
}

function inputError(message) {
  console.error(message)
  process.exit(2)
}

let args
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      checkout: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
} catch (error) {
  usageError(error.message)
}
if (args.values.help) {
  console.log(USAGE)
  process.exit(0)
}
if (args.positionals.length !== 1) usageError('expected exactly one argument: the account download')

// Under a wrapper script (a test slot), when one is configured: the script runs again inside it, once.
if (process.env.RCA_TESTSLOT && process.env.RCA_REPLICA_SLOTTED !== '1') {
  const rerun = [process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)]
  process.exit(
    await runInGroup(process.env.RCA_TESTSLOT, rerun, { ...process.env, RCA_REPLICA_SLOTTED: '1' }),
  )
}

const CHECKOUT = resolve(args.values.checkout ?? OWN_CHECKOUT)
// The default output is next to this script, not in --checkout: an older checkout may not ignore it.
const OUT = resolve(args.values.out ?? join(OWN_CHECKOUT, '.replica-out'))
const DOWNLOAD = resolve(args.positionals[0])
const WEB = join(CHECKOUT, 'apps', 'web')

if (!existsSync(join(WEB, 'dist', 'index.html'))) {
  inputError(`no build at ${join(WEB, 'dist')}: run "npm ci && npm run build" in ${CHECKOUT} first`)
}
if (!existsSync(DOWNLOAD)) inputError(`account download not found: ${DOWNLOAD}`)
const unsafe = outDirProblem(OUT)
if (unsafe !== null) inputError(unsafe)

let download
try {
  download = JSON.parse(readFileSync(DOWNLOAD, 'utf8'))
} catch {
  // The parser's message quotes the file, which may be real data, so it is not repeated.
  inputError(`${DOWNLOAD} is not valid JSON`)
}
if (download?.format !== 'rca-export') {
  inputError(`not an RCA account download: format is ${JSON.stringify(download?.format)}`)
}
if (
  !Array.isArray(download.activities) ||
  typeof download.profile !== 'object' ||
  download.profile === null
) {
  inputError('not an RCA account download: it has no profile or no activity list')
}
if (download.version !== 2) {
  console.warn(
    `warning: this tool reads download version 2; this one is version ${download.version}`,
  )
}

mkdirSync(OUT, { recursive: true })
const { chromium } = createRequire(join(WEB, 'package.json'))('@playwright/test')

const startedAt = Date.now()
const seconds = (from = startedAt) => Math.round((Date.now() - from) / 100) / 10
const log = (message) => console.log(`[${seconds()}s] ${message}`)
const { note, record, write } = createReport(OUT)

/** What is running, so a signal or a failure can stop it. */
const running = { worker: null, browser: null }
let cleaning = null
let seeded = null

/** Closes Chromium and stops the Worker, once. A browser that will not close is killed when this process exits. */
function cleanup() {
  cleaning ??= (async () => {
    const closing = running.browser?.close().catch(() => undefined)
    await Promise.race([closing, new Promise((r) => setTimeout(r, BROWSER_CLOSE_TIMEOUT_MS))])
    if (running.worker !== null) await stopWorker(running.worker)
  })()
  return cleaning
}

/** Writes the run's summary files and returns the line printed at the end. */
function finish(failure) {
  const { commit, errors } = write({
    checkout: CHECKOUT,
    seeded,
    failure,
    totalSeconds: seconds(),
  })
  return `commit ${commit}, ${seconds()}s total, console errors ${errors}, out ${OUT}`
}

let stoppedBy = null
for (const signal of SIGNALS) {
  process.on(signal, () => {
    // A second signal stops waiting; the exit handlers still kill what is left.
    if (stoppedBy !== null) process.exit(signalExitCode(signal))
    stoppedBy = signal
    note('stopped', signal)
    cleanup().finally(() => {
      console.error(`stopped by ${signal}`)
      console.log(finish(new Error(`stopped by ${signal}`)))
      process.exit(signalExitCode(signal))
    })
  })
}

async function main() {
  const port = await freePort()
  const origin = `http://localhost:${port}`
  running.worker = await startWorker({ checkout: CHECKOUT, state: join(OUT, '.state'), port })
  log(`worker on ${origin}`)
  try {
    // The signal handlers above do the stopping, so Playwright's own would race them.
    running.browser = await chromium.launch({
      headless: true,
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    })
    const context = await running.browser.newContext({
      viewport: VIEWPORT,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
      baseURL: origin,
    })
    // Only the local Worker is reachable; anything else is blocked and listed in console.txt.
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      if (url.origin !== origin && url.protocol !== 'data:' && url.protocol !== 'blob:') {
        note('blocked', `${route.request().method()} ${url.origin}${url.pathname}`)
        return route.abort()
      }
      return route.continue()
    })
    const page = await context.newPage()
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        note(`console.${message.type()}`, message.text())
    })
    page.on('pageerror', (error) => note('pageerror', error.message))

    seeded = await seedAccount({ request: page.request, download, account: ACCOUNT, log })
    writeFileSync(join(OUT, 'seed.json'), `${JSON.stringify(seeded, null, 2)}\n`)

    await page.goto('/')
    await page
      .getByText('Checking sign-in…')
      .waitFor({ state: 'hidden', timeout: 60_000 })
      .catch(() => undefined)
    await page.getByRole('navigation', { name: 'Pages' }).waitFor({ timeout: 180_000 })
    log('signed in and loaded')

    for (const target of PAGES) {
      await goToPage(page, target)
      await settle(page, `${target.name}/default`, note)
      record(target.name, 'default', await mainText(page))
      await page.screenshot({ path: join(OUT, `${target.name}-default.png`), fullPage: true })
    }
    log('default period written')

    for (const period of PERIODS) {
      for (const target of PAGES) {
        await goToPage(page, target)
        const offered = target.period ? await pickPeriod(page, period.label) : true
        if (!offered) {
          writeFileSync(
            join(OUT, `${target.name}-${period.file}.txt`),
            `[${target.name} does not offer ${period.label}]\n`,
          )
          continue
        }
        await settle(page, `${target.name}/${period.file}`, note)
        record(target.name, period.file, await mainText(page))
        if (period.file === 'all-time') {
          await page.screenshot({ path: join(OUT, `${target.name}-all-time.png`), fullPage: true })
        }
      }
      log(`${period.label} written`)
    }
    await running.browser.close()
  } finally {
    await cleanup()
  }
}

let failure = null
try {
  await main()
} catch (error) {
  failure = error
  // A failure caused by a signal closing the browser is not worth a line of its own.
  if (stoppedBy === null) note('script', String(error?.stack ?? error))
}
// When a signal stopped the run, its handler writes the summary and exits.
if (stoppedBy === null) {
  let problem = null
  if (seeded !== null) {
    const measurementsRefused = seeded.measurements.refused
    if (measurementsRefused.length > 0) {
      console.error(
        `${measurementsRefused.length} measurements refused (${refusalCounts(measurementsRefused)})`,
      )
    }
    problem = seedProblem(seeded)
    if (problem !== null) {
      console.error(problem)
      failure ??= new Error(problem)
    }
  }
  console.log(finish(failure))
  // A seed problem was printed above; any other failure is printed with its trace.
  if (failure !== null && failure.message !== problem) console.error(failure)
  process.exit(failure === null ? 0 : 1)
}
