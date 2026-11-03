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
 *   --out <dir>       where the output goes. Default: .replica-out/ in the checkout, which git ignores.
 *   --checkout <dir>  a checkout whose apps/web/dist is built (`npm ci && npm run build` there).
 *                     Default: the checkout this script lives in.
 *   -h, --help        this text.
 *
 * Environment:
 *   RCA_TESTSLOT      optional path of an executable that runs its arguments once a machine-wide test slot is
 *                     free. When set, this script re-runs under it.
 *
 * Exit codes: 0 the run finished; 1 the run failed (whatever was written is still in the output folder);
 * 2 bad usage or a missing input (no build, no download, not an RCA download).
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
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { PAGES, PERIODS, goToPage, mainText, pickPeriod, settle } from './drive.mjs'
import { freePort, seedAccount, startWorker } from './worker.mjs'

const USAGE = `usage: node scripts/replica/replica.mjs <download.json> [--out <dir>] [--checkout <dir>]
Loads an RCA account download into a local Worker and writes what every page says, signed in.
The download and the output hold real data: keep both outside git. See scripts/replica/README.md.`

const ACCOUNT = { email: 'replica@example.test', name: 'Replica' }
const VIEWPORT = { width: 1280, height: 900 }
/** Lines holding one of these (case-insensitive) are collected in withheld.txt: the app saying it holds a figure back. */
const WITHHOLD_PATTERNS = [
  'not enough',
  'needs',
  'not a hard effort',
  'No comparable',
  'It takes',
  'add ',
  'at least',
  'not all-out',
  'set aside',
  'left out',
]

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

// Under a test slot wrapper, when one is configured: the script runs again inside it, once.
if (process.env.RCA_TESTSLOT && process.env.RCA_REPLICA_SLOTTED !== '1') {
  const rerun = [process.execPath, fileURLToPath(import.meta.url), ...process.argv.slice(2)]
  const wrapped = spawnSync(process.env.RCA_TESTSLOT, rerun, {
    stdio: 'inherit',
    env: { ...process.env, RCA_REPLICA_SLOTTED: '1' },
  })
  process.exit(wrapped.status ?? 1)
}

const CHECKOUT = resolve(args.values.checkout ?? fileURLToPath(new URL('../../', import.meta.url)))
const OUT = resolve(args.values.out ?? join(CHECKOUT, '.replica-out'))
const DOWNLOAD = resolve(args.positionals[0])
const WEB = join(CHECKOUT, 'apps', 'web')

if (!existsSync(join(WEB, 'dist', 'index.html'))) {
  inputError(`no build at ${join(WEB, 'dist')}: run "npm ci && npm run build" in ${CHECKOUT} first`)
}
if (!existsSync(DOWNLOAD)) inputError(`account download not found: ${DOWNLOAD}`)

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
const consoleLines = []
const note = (kind, text) =>
  consoleLines.push(`${kind}\t${String(text).replace(/\s+/g, ' ').slice(0, 400)}`)

const rows = []
const withheld = []
/** Writes one page's text and counts the lines where the app holds a figure back. */
function record(pageName, periodFile, text) {
  writeFileSync(join(OUT, `${pageName}-${periodFile}.txt`), `${text}\n`)
  const lines = text.split('\n')
  const hits = lines.filter((line) =>
    WITHHOLD_PATTERNS.some((p) => line.toLowerCase().includes(p.toLowerCase())),
  )
  rows.push({ page: pageName, period: periodFile, lines: lines.length, withheld: hits.length })
  if (hits.length > 0)
    withheld.push(`## ${pageName} / ${periodFile}`, ...hits.map((line) => `  ${line}`), '')
}

async function main() {
  const port = await freePort()
  const origin = `http://localhost:${port}`
  const worker = await startWorker({ checkout: CHECKOUT, state: join(OUT, '.state'), port })
  log(`worker on ${origin}`)
  let browser
  let seeded = null
  try {
    browser = await chromium.launch({ headless: true })
    const context = await browser.newContext({
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
    await page.getByRole('navigation', { name: 'Sections' }).waitFor({ timeout: 180_000 })
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
    await context.close()
  } finally {
    await browser?.close().catch(() => undefined)
    worker.kill()
  }
  return seeded
}

let failure = null
let seeded = null
try {
  seeded = await main()
} catch (error) {
  failure = error
  note('script', String(error?.stack ?? error))
}

writeFileSync(join(OUT, 'console.txt'), `${consoleLines.join('\n')}\n`)
writeFileSync(join(OUT, 'withheld.txt'), `${withheld.join('\n')}\n`)
writeFileSync(
  join(OUT, 'counts.tsv'),
  [
    'page\tperiod\tlines\twithheld',
    ...rows.map((r) => `${r.page}\t${r.period}\t${r.lines}\t${r.withheld}`),
  ].join('\n') + '\n',
)
const commit =
  spawnSync('git', ['-C', CHECKOUT, 'rev-parse', '--short=8', 'HEAD'], {
    encoding: 'utf8',
  }).stdout?.trim() ?? ''
const errors = consoleLines.filter((l) => /^(console\.error|pageerror|script)\t/.test(l)).length
writeFileSync(
  join(OUT, 'run.json'),
  `${JSON.stringify(
    {
      commit,
      totalSeconds: seconds(),
      activities: seeded?.activities?.loaded ?? null,
      refused: seeded?.activities?.refused?.length ?? null,
      consoleErrors: errors,
      failed: failure === null ? null : String(failure?.message ?? failure),
    },
    null,
    2,
  )}\n`,
)
console.log(`commit ${commit}, ${seconds()}s total, console errors ${errors}, out ${OUT}`)
if (failure !== null) {
  console.error(failure)
  process.exit(1)
}
