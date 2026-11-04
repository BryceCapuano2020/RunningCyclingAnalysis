import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

/*
 * One figure, one function (docs/ENGINEERING.md): the web names and formats the fitness figures core makes, and works none out. A
 * file under apps/web/src that imports the grading, the cross-sport equivalence, the metabolic conversions or the model priors can
 * work out its own copy of a figure, which then drifts from the one the other pages show. The conversions the pages need are
 * `@rca/core/display`; the grades and the lead are `@rca/core/standing`.
 */

const root = new URL('../../', import.meta.url).pathname
const WEB = join(root, 'apps/web/src')

/** The names a web file may not import: each works out a grade, an equivalence or a conversion. */
const BANNED = [
  /^gradeAtSpeed$/,
  /^rideGradeFromSpeeds$/,
  /^gradeEffort$/,
  /^equivalenceFor$/,
  /^metabolicTo[A-Z]\w*$/,
  /^\w+ToMetabolic$/,
  /^PRIORS$/,
  /^DURATION_TABLES$/,
]

/**
 * The files allowed to import a banned name, each with the reason. Keep it short: a new entry is a second path to a figure and
 * needs a reason a reviewer accepts.
 */
const ALLOWED = new Map([
  [
    'ui/grades.ts',
    'grades a best at a duration (the grade by duration) and a distance record by its finish time, which the road standards grade; neither is a threshold figure',
  ],
  [
    'ui/gradeProfile.ts',
    'prices a ride best at the durations a combine does not, by the same anchored equivalence the result uses, for the grade by duration',
  ],
])

async function* sourceFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'test') yield* sourceFiles(path)
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|story)\.(ts|tsx)$/.test(entry.name)) {
      yield path
    }
  }
}

/** The value names a file imports or re-exports by name; type-only imports and inline `type` specifiers are not display math. */
export function importedNames(source) {
  const names = []
  const statement = /\b(?:import|export)\s+(type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]+['"]/g
  for (const match of source.matchAll(statement)) {
    if (match[1]) continue
    for (const part of match[2].split(',')) {
      const spec = part.trim()
      if (spec === '' || spec.startsWith('type ')) continue
      names.push(spec.split(/\s+as\s+/)[0])
    }
  }
  return names
}

export const isBanned = (name) => BANNED.some((pattern) => pattern.test(name))

test('importedNames reads named imports and re-exports, and skips types', () => {
  const source = [
    "import { gradeEffort, type Foo, bar as PRIORS } from '@rca/core/grade'",
    "import type { equivalenceFor } from '@rca/core/pipeline'",
    "export { metabolicToFlatSpeed } from '@rca/core/metabolic'",
    "import { flatSpeedOfWkg } from '@rca/core/display'",
  ].join('\n')
  assert.deepEqual(importedNames(source), [
    'gradeEffort',
    'bar',
    'metabolicToFlatSpeed',
    'flatSpeedOfWkg',
  ])
  assert.deepEqual(importedNames(source).filter(isBanned), ['gradeEffort', 'metabolicToFlatSpeed'])
})

test('the display conversions and standing are not banned', () => {
  for (const name of [
    'flatSpeedOfWkg',
    'ridePowerAt',
    'nativeOfWkg',
    'sportStanding',
    'gradeThreshold',
  ]) {
    assert.equal(isBanned(name), false, name)
  }
})

test('no file under apps/web/src imports display math, outside the short allow-list', async () => {
  const offenders = []
  const used = new Set()
  for await (const path of sourceFiles(WEB)) {
    const key = relative(WEB, path)
    const banned = importedNames(await readFile(path, 'utf8')).filter(isBanned)
    if (banned.length === 0) continue
    if (ALLOWED.has(key)) used.add(key)
    else offenders.push(`${key}: ${[...new Set(banned)].join(', ')}`)
  }
  assert.deepEqual(
    offenders,
    [],
    'Work the figure out in packages/core (@rca/core/display or @rca/core/standing) and format it here',
  )
  assert.deepEqual(
    [...ALLOWED.keys()].filter((key) => !used.has(key)),
    [],
    'An allow-list entry that no longer imports display math is dead: remove it',
  )
})
