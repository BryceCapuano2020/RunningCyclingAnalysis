import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

/*
 * One figure, one function (docs/ENGINEERING.md): the web names and formats the fitness figures core makes, and works none out. A
 * file under apps/web/src that imports the grading, the cross-sport equivalence, the metabolic conversions or the model priors can
 * work out its own copy of a figure, which then drifts from the one the other pages show. The conversions the pages need are
 * `@rca/core/display`; the grades and the lead are `@rca/core/standing`.
 *
 * The scan reads the source as text (no parser, so it holds across the TypeScript upgrade): it blanks comments, then reads every
 * way a name or a whole module comes in: `import { a }`, `import d, { a }`, `import * as m`, `import('x')`, `export * from 'x'` and
 * `export { a } from 'x'`. A whole module of core (namespace, star or dynamic) hides the names it takes, so it is refused outright.
 */

const root = new URL('../../', import.meta.url).pathname
const WEB = join(root, 'apps/web/src')

/** The names a web file may not import: each works out a grade, an equivalence or a conversion, or is the model's raw cost. */
const BANNED = [
  /^gradeAtSpeed$/,
  /^rideGradeFromSpeeds$/,
  /^gradeEffort$/,
  /^ageGradeForEffort$/,
  /^equivalenceFor$/,
  /^metabolicTo[A-Z]\w*$/,
  /^\w+ToMetabolic$/,
  /^PRIORS$/,
  /^DURATION_TABLES$/,
  /^runDurationRatio$/,
  /^FLAT_RUN_COST$/,
  /^RESTING_W_PER_KG$/,
]

/**
 * The files allowed to import a banned name, each with the reason. Keep it short: a new entry is a second path to a figure and
 * needs a reason a reviewer accepts.
 */
const ALLOWED = new Map([
  [
    'ui/grades.ts',
    'grades a best at a duration (an activity’s and the records’ bests) and a distance record by its finish time, which the road standards grade; neither is a threshold figure',
  ],
])

/** Test support builds synthetic inputs, which can work a figure backwards; production code may not import it (below). */
const isSupport = (path) => /(^|[\\/])(test|[\w-]*[Ff]ixtures?)([\\/.]|$)/.test(path)

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

/**
 * The source with its comments blanked and its strings kept, so a line of documentation that mentions `import (x)` is not code. A
 * quote ends at the end of its line, so an apostrophe in JSX text cannot swallow the file.
 */
export function withoutComments(source) {
  let out = ''
  let i = 0
  while (i < source.length) {
    const c = source[i]
    const next = source[i + 1]
    if (c === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i++
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      const stop = end < 0 ? source.length : end + 2
      out += source.slice(i, stop).replace(/[^\n]/g, ' ')
      i = stop
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1
      while (j < source.length && source[j] !== c && (c === '`' || source[j] !== '\n')) {
        j += source[j] === '\\' ? 2 : 1
      }
      out += source.slice(i, j + 1)
      i = j + 1
    } else {
      out += c
      i++
    }
  }
  return out
}

/** The value names in `{ a, type b, c as d }`, as exported by their source module: type specifiers are erased and so are skipped. */
function namesIn(braces) {
  return braces
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '' && !part.startsWith('type '))
    .map((part) => part.split(/\s+as\s+/)[0])
}

/**
 * Everything a file takes from other modules, as `{ from, names, whole }`: the value names it imports or re-exports by name, or
 * `whole` where it takes a module as a whole (namespace import, `export *`, dynamic `import('x')`). Type-only forms are skipped.
 */
export function importsOf(source) {
  const text = withoutComments(source)
  const found = []
  for (const match of text.matchAll(/\bimport\s+([^;'"`()]*?)\s+from\s*(['"])([^'"\n]+)\2/g)) {
    const clause = match[1]
    if (/^type\s/.test(clause)) continue
    const braces = /\{([^}]*)\}/.exec(clause)
    const whole = /\*\s*as\s+[\w$]+/.test(clause)
    const lead = /^([\w$]+)\s*(,|$)/.exec(clause)
    found.push({
      from: match[3],
      names: [...(lead ? ['default'] : []), ...(braces ? namesIn(braces[1]) : [])],
      whole,
    })
  }
  for (const match of text.matchAll(
    /\bexport\s+(type\s+)?(\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(['"])([^'"\n]+)\3/g,
  )) {
    if (match[1]) continue
    const star = match[2].startsWith('*')
    found.push({
      from: match[4],
      names: star ? [] : namesIn(match[2].slice(1, -1)),
      whole: star,
    })
  }
  for (const match of text.matchAll(/\bimport\s*\(\s*(['"`])([^'"`\n]+)\1/g)) {
    found.push({ from: match[2], names: [], whole: true })
  }
  return found
}

export const isBanned = (name) => BANNED.some((pattern) => pattern.test(name))

/** Whether a specifier reaches the core package, by its name or by a relative path into it. */
const isCore = (specifier) =>
  /^@rca\/core(\/|$)/.test(specifier) || /(^|\/)packages\/core(\/|$)/.test(specifier)

/** What a source takes that a web file may not: a banned name, or a whole module of core. Each is a label for the report. */
export function offencesIn(source) {
  const offences = []
  for (const { from, names, whole } of importsOf(source)) {
    offences.push(...names.filter(isBanned))
    if (whole && isCore(from)) offences.push(`the whole of ${from}`)
  }
  return [...new Set(offences)]
}

/** The relative specifiers a source imports that name test support: production code may not read a fixture. */
export function supportImportsIn(source) {
  return importsOf(source)
    .map(({ from }) => from)
    .filter((from) => from.startsWith('.') && isSupport(from))
}

test('importsOf reads named, default, namespace, dynamic and re-exported imports, and skips types and comments', () => {
  const source = [
    "import { gradeEffort, type Foo, bar as PRIORS } from '@rca/core/grade'",
    "import type { equivalenceFor } from '@rca/core/pipeline'",
    "import Thing, { runDurationRatio } from '@rca/core/threshold/durationTables'",
    "import * as everything from '@rca/core/metabolic'",
    "export { metabolicToFlatSpeed } from '@rca/core/metabolic'",
    "export * from '@rca/core/grade'",
    "export * as grade from '@rca/core/grade'",
    "export type { gradeAtSpeed } from '@rca/core/grade'",
    "const lazy = await import('@rca/core/constants')",
    "import { flatSpeedOfWkg } from '@rca/core/display'",
    "// import { PRIORS } from '@rca/core/constants'",
    "/* import('@rca/core/grade') */",
    "import {\n  FLAT_RUN_COST,\n  HEADLINE_DURATION_S,\n} from '@rca/core/constants'",
  ].join('\n')
  assert.deepEqual(importsOf(source), [
    { from: '@rca/core/grade', names: ['gradeEffort', 'bar'], whole: false },
    {
      from: '@rca/core/threshold/durationTables',
      names: ['default', 'runDurationRatio'],
      whole: false,
    },
    { from: '@rca/core/metabolic', names: [], whole: true },
    { from: '@rca/core/display', names: ['flatSpeedOfWkg'], whole: false },
    { from: '@rca/core/constants', names: ['FLAT_RUN_COST', 'HEADLINE_DURATION_S'], whole: false },
    { from: '@rca/core/metabolic', names: ['metabolicToFlatSpeed'], whole: false },
    { from: '@rca/core/grade', names: [], whole: true },
    { from: '@rca/core/grade', names: [], whole: true },
    { from: '@rca/core/constants', names: [], whole: true },
  ])
})

test('an apostrophe in JSX text or a path in a comment does not hide the imports around it', () => {
  const source = [
    "import { PRIORS } from '@rca/core/constants'",
    "export const note = <p>Don't use http://example.com</p>",
    "export const lazy = () => import('@rca/core/grade')",
  ].join('\n')
  assert.deepEqual(offencesIn(source), ['PRIORS', 'the whole of @rca/core/grade'])
})

// Each way a file can reach display math, probed on its own: the guard must refuse every one.
for (const [how, source] of [
  ['a named import', "import { gradeAtSpeed } from '@rca/core/grade'"],
  ['a default import beside a named one', "import Priors, { PRIORS } from '@rca/core/constants'"],
  ['an aliased import', "import { PRIORS as P } from '@rca/core/constants'"],
  ['a namespace import', "import * as m from '@rca/core/metabolic'"],
  ['a dynamic import', "const m = await import('@rca/core/grade')"],
  [
    'a dynamic import by relative path into core',
    "const m = await import('../../../../packages/core/src/grade')",
  ],
  ['a star re-export', "export * from '@rca/core/grade'"],
  ['a named re-export', "export { gradeEffort } from '@rca/core/grade'"],
  [
    'a multi-line import',
    "import {\n  HEADLINE_DURATION_S,\n  ageGradeForEffort,\n} from '@rca/core/grade'",
  ],
  ['the raw flat running cost', "import { FLAT_RUN_COST } from '@rca/core/constants'"],
  ['the resting cost', "import { RESTING_W_PER_KG } from '@rca/core/constants'"],
  ['the age grade of an effort', "import { ageGradeForEffort } from '@rca/core/grade'"],
  ['the duration ratio', "import { runDurationRatio } from '@rca/core/threshold/durationTables'"],
  ['a metabolic conversion', "import { metabolicToRidePower } from '@rca/core/metabolic'"],
  ['the other direction', "import { ridePowerToMetabolic } from '@rca/core/metabolic'"],
]) {
  test(`refuses ${how}`, () => {
    assert.notDeepEqual(offencesIn(source), [])
  })
}

test('lets through the display module, standing, types, relative modules and the web’s own lazy pages', () => {
  const source = [
    "import { flatSpeedOfWkg, ridePowerAt } from '@rca/core/display'",
    "import { sportStanding, gradeThreshold } from '@rca/core/standing'",
    "import type { PRIORS } from '@rca/core/constants'",
    "import type * as grades from '@rca/core/grade'",
    "export type { gradeEffort } from '@rca/core/grade'",
    "export * from './gradeNotes'",
    "import * as api from '../api/client'",
    "const page = () => import('./pages/HistoryPage')",
  ].join('\n')
  assert.deepEqual(offencesIn(source), [])
})

test('names fixtures and test folders as support, and not an ordinary module', () => {
  for (const path of [
    './fixtures',
    '../components/fixtures',
    './balanceFixtures',
    './test/warmSample',
  ]) {
    assert.equal(isSupport(path), true, path)
  }
  for (const path of ['./grades', './landingFigures', './latest', './contest']) {
    assert.equal(isSupport(path), false, path)
  }
  assert.deepEqual(
    supportImportsIn("import { x } from './balanceFixtures'\nimport { y } from './grades'"),
    ['./balanceFixtures'],
  )
})

test('no file under apps/web/src takes display math, outside the short allow-list', async () => {
  const offenders = []
  const used = new Set()
  for await (const path of sourceFiles(WEB)) {
    const key = relative(WEB, path)
    if (isSupport(key)) continue
    const offences = offencesIn(await readFile(path, 'utf8'))
    if (offences.length === 0) continue
    if (ALLOWED.has(key)) used.add(key)
    else offenders.push(`${key}: ${offences.join(', ')}`)
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

test('no production file under apps/web/src imports test support', async () => {
  const offenders = []
  for await (const path of sourceFiles(WEB)) {
    const key = relative(WEB, path)
    if (isSupport(key)) continue
    const support = supportImportsIn(await readFile(path, 'utf8'))
    if (support.length > 0) offenders.push(`${key}: ${support.join(', ')}`)
  }
  assert.deepEqual(
    offenders,
    [],
    'A fixture is exempt from the figure guard only because production code never reads it',
  )
})
