import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

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

/** What a run collects as it goes, and the files it writes at the end. All of it is private. */
export function createReport(out) {
  const consoleLines = []
  const rows = []
  const withheld = []

  /** Adds a line to console.txt. */
  const note = (kind, text) =>
    consoleLines.push(`${kind}\t${String(text).replace(/\s+/g, ' ').slice(0, 400)}`)

  /** Writes one page's text and counts the lines where the app holds a figure back. */
  function record(pageName, periodFile, text) {
    writeFileSync(join(out, `${pageName}-${periodFile}.txt`), `${text}\n`)
    const lines = text.split('\n')
    const hits = lines.filter((line) =>
      WITHHOLD_PATTERNS.some((p) => line.toLowerCase().includes(p.toLowerCase())),
    )
    rows.push({ page: pageName, period: periodFile, lines: lines.length, withheld: hits.length })
    if (hits.length > 0)
      withheld.push(`## ${pageName} / ${periodFile}`, ...hits.map((line) => `  ${line}`), '')
  }

  /** Writes console.txt, withheld.txt, counts.tsv and run.json; returns the console error count. */
  function write({ checkout, seeded, failure, totalSeconds }) {
    writeFileSync(join(out, 'console.txt'), `${consoleLines.join('\n')}\n`)
    writeFileSync(join(out, 'withheld.txt'), `${withheld.join('\n')}\n`)
    writeFileSync(
      join(out, 'counts.tsv'),
      [
        'page\tperiod\tlines\twithheld',
        ...rows.map((r) => `${r.page}\t${r.period}\t${r.lines}\t${r.withheld}`),
      ].join('\n') + '\n',
    )
    const commit =
      spawnSync('git', ['-C', checkout, 'rev-parse', '--short=8', 'HEAD'], {
        encoding: 'utf8',
      }).stdout?.trim() ?? ''
    const errors = consoleLines.filter((l) => /^(console\.error|pageerror|script)\t/.test(l)).length
    writeFileSync(
      join(out, 'run.json'),
      `${JSON.stringify(
        {
          commit,
          totalSeconds,
          activities: seeded?.activities?.loaded ?? null,
          refused: seeded?.activities?.refused?.length ?? null,
          consoleErrors: errors,
          failed: failure === null ? null : String(failure?.message ?? failure),
        },
        null,
        2,
      )}\n`,
    )
    return { commit, errors }
  }

  return { note, record, write }
}

/** Refusals counted by status and API error code, such as "409 stale_revision x12". Counts only. */
export function refusalCounts(refused) {
  const counts = new Map()
  for (const { status, code } of refused) {
    const key = code ? `${status} ${code}` : `${status}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => `${key} x${count}`)
    .join(', ')
}

/**
 * Why a seeded account cannot be trusted, or null. A run whose activities were refused, or none loaded,
 * writes pages for a different account than the download, so it fails.
 */
export function seedProblem({ activities }) {
  if (activities.refused.length > 0) {
    return `${activities.refused.length} of ${activities.total} activities were refused (${refusalCounts(activities.refused)})`
  }
  if (activities.loaded === 0) return 'no activities were loaded: the download holds none'
  return null
}
