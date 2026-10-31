import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const DIST_DIR = fileURLToPath(new URL('../../apps/web/dist/', import.meta.url))

/**
 * The most gzip bytes each part of the web build may weigh. The numbers sit about 15% above the build
 * they were set from, so ordinary work fits and a change that doubles a part does not. A budget that
 * is hit is raised or the code split, never worked around; lower a number when a change shrinks its
 * part, so the headroom stays about the same.
 *
 * - initial: the script the page loads, the chunks it preloads and its stylesheets, which every visit pays.
 * - worker: the analysis worker, fetched when a request first needs it.
 * - chunk: any one other script, which loads when its page is first opened.
 * - style: any one other stylesheet, which loads with its page.
 */
export const BUDGETS = {
  initial: 285_000,
  worker: 160_000,
  chunk: 75_000,
  style: 13_000,
}

const REFERENCE = /<(?:script|link)\b[^>]*?(?:src|href)="\.\/(assets\/[^"]+\.(?:js|css))"[^>]*>/g
const WORKER = /^analysis\.worker-.*\.js$/

const gzipSize = (bytes) => gzipSync(bytes).length

/** What the build weighs, in gzip bytes: the initial load, the worker, and every other script on its own. */
export async function measureBundle(dist = DIST_DIR) {
  let html
  try {
    html = await readFile(resolve(dist, 'index.html'), 'utf8')
  } catch {
    throw new Error('index.html is missing from the web build. Run npm run build first.')
  }
  const initialFiles = new Set([...html.matchAll(REFERENCE)].map((match) => match[1]))
  if (initialFiles.size === 0) throw new Error('index.html loads no script from assets/.')

  const sizes = new Map()
  for (const name of await readdir(resolve(dist, 'assets'))) {
    if (!/\.(js|css)$/.test(name)) continue
    sizes.set(`assets/${name}`, gzipSize(await readFile(resolve(dist, 'assets', name))))
  }
  let initial = 0
  for (const file of initialFiles) {
    const size = sizes.get(file)
    if (size === undefined) throw new Error(`index.html loads ${file}, which the build lacks.`)
    initial += size
    sizes.delete(file)
  }
  let worker = 0
  const chunks = []
  const styles = []
  for (const [file, size] of sizes) {
    if (file.endsWith('.css')) {
      styles.push({ file, size })
      continue
    }
    if (WORKER.test(file.slice('assets/'.length))) worker = Math.max(worker, size)
    else chunks.push({ file, size })
  }
  chunks.sort((a, b) => b.size - a.size)
  styles.sort((a, b) => b.size - a.size)
  return { initial, worker, chunks, styles }
}

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} KB`

/** The budgets the measured build is over, one line each; empty when it fits. */
export function overBudget({ initial, worker, chunks, styles = [] }, budgets = BUDGETS) {
  const problems = []
  if (initial > budgets.initial)
    problems.push(`initial load is ${kb(initial)} gzip (budget ${kb(budgets.initial)})`)
  if (worker > budgets.worker)
    problems.push(`analysis worker is ${kb(worker)} gzip (budget ${kb(budgets.worker)})`)
  for (const { file, size } of chunks) {
    if (size > budgets.chunk)
      problems.push(`${file} is ${kb(size)} gzip (budget ${kb(budgets.chunk)} for one chunk)`)
  }
  for (const { file, size } of styles) {
    if (size > budgets.style)
      problems.push(`${file} is ${kb(size)} gzip (budget ${kb(budgets.style)} for one stylesheet)`)
  }
  return problems
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const measured = await measureBundle()
  console.log(
    `initial ${kb(measured.initial)} of ${kb(BUDGETS.initial)}, worker ${kb(measured.worker)} of ${kb(BUDGETS.worker)}, ` +
      `largest chunk ${kb(measured.chunks[0]?.size ?? 0)} of ${kb(BUDGETS.chunk)}, ` +
      `largest stylesheet ${kb(measured.styles[0]?.size ?? 0)} of ${kb(BUDGETS.style)} (gzip)`,
  )
  const problems = overBudget(measured)
  if (problems.length > 0) {
    console.error(`Bundle over budget:\n${problems.map((line) => `- ${line}`).join('\n')}`)
    process.exitCode = 1
  }
}
