import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMMENT_LINES, EFFECTS, TIMERS, TYPE_ESCAPES } from './guardrails.ratchet.mjs'
import {
  commentLineCount,
  countEffects,
  countTimers,
  countTypeEscapes,
} from './guardrails.scan.mjs'
import { scanLines, withoutComments } from './scanSource.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))

const SOURCE = /\.(ts|tsx|mts|js|jsx|mjs)$/
const NOT_SOURCE = /\.(test|spec|sim|perf|story)\./
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'coverage',
  'test',
  'tests',
  '__tests__',
  'e2e',
  'fixtures',
  'test-corpus',
])

async function sourceFiles(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) files.push(...(await sourceFiles(join(dir, entry.name))))
    } else if (SOURCE.test(entry.name) && !NOT_SOURCE.test(entry.name))
      files.push(join(dir, entry.name))
  }
  return files
}

/** Every non-test file under `<app or package>/src`, as { file (repo-relative), pkg, text }. */
async function allSources() {
  const sources = []
  for (const top of ['apps', 'packages']) {
    for (const pkg of await readdir(join(root, top))) {
      const src = join(root, top, pkg, 'src')
      let files = []
      try {
        files = await sourceFiles(src)
      } catch {
        continue
      }
      for (const file of files) {
        sources.push({
          file: relative(root, file),
          pkg: `${top}/${pkg}`,
          text: await readFile(file, 'utf8'),
        })
      }
    }
  }
  return sources
}

const sources = await allSources()
const web = sources.filter((s) => s.file.startsWith('apps/web/src/'))

const perFile = (list, count) =>
  new Map(list.map((s) => [s.file, count(s.text)]).filter(([, n]) => n > 0))

const perPackage = (list, count) => {
  const totals = new Map()
  for (const s of list) totals.set(s.pkg, (totals.get(s.pkg) ?? 0) + count(s.text))
  return totals
}

/** Failures for counts above their ceiling, and ceilings that no longer match the code. */
function check(counts, ceilings, fix) {
  const over = []
  const slack = []
  for (const [name, n] of counts) {
    const ceiling = ceilings[name] ?? 0
    if (n > ceiling) over.push(`${name}: ${n} (ceiling ${ceiling}). ${fix}`)
  }
  for (const [name, ceiling] of Object.entries(ceilings)) {
    const n = counts.get(name) ?? 0
    if (n === 0) slack.push(`${name}: now 0; remove its entry`)
    else if (n < ceiling) slack.push(`${name}: now ${n}; lower its entry to ${n}`)
  }
  return { over, slack }
}

const EFFECT_FIX =
  'Do not add an effect. Derive the value during render, do the work in the event handler that causes it, or use a hook that already wraps the effect (useNow, useMediaQuery, useDelayedFlag in apps/web/src/ui). Never add an effect to patch over ordering; fix the ordering.'
const TIMER_FIX =
  'Do not add a timer. Use a hook that already owns it (useNow for the clock, useDelayedFlag for a delay, useMediaQuery for layout) or CSS for animation. Never add a timer to wait out a race; fix the ordering.'
const ESCAPE_FIX =
  'Fix the type: narrow with a guard, parse at the boundary with the contract schema, or correct the declaration. Do not cast around it.'
const COMMENT_FIX =
  'Make a name say it, or turn the rule into a test. A formula or published-table citation may be a "// source: <ref>" line. Never write a comment explaining why a workaround is fine; remove the workaround.'

const ratchets = [
  ['React effects (apps/web/src)', perFile(web, countEffects), EFFECTS, EFFECT_FIX],
  ['imperative timers (apps/web/src)', perFile(web, countTimers), TIMERS, TIMER_FIX],
  ['type escapes', perFile(sources, countTypeEscapes), TYPE_ESCAPES, ESCAPE_FIX],
  ['comment lines per package', perPackage(sources, commentLineCount), COMMENT_LINES, COMMENT_FIX],
]

for (const [label, counts, ceilings, fix] of ratchets) {
  test(`${label} stay within their ceilings`, () => {
    assert.deepEqual(check(counts, ceilings, fix).over, [])
  })
  test(`${label} ceilings are still needed`, () => {
    assert.deepEqual(check(counts, ceilings, fix).slack, [])
  })
}

test('the scanner does not read a URL in a string as a comment', () => {
  const [line] = scanLines('const u = "http://example.com" // real')
  assert.match(line.code, /^const u = "\s+"/)
  assert.equal(line.comment, '// real')
  assert.equal(commentLineCount("const u = 'http://x'\nconst v = `//y`"), 0)
})

test('the scanner keeps strings and blanks comments when asked, for the import scan', () => {
  const source = "import a from './a' // x\nconst u = `//y` /* z */ + '/*'"
  assert.equal(withoutComments(source), "import a from './a' \nconst u = `//y`   + '/*'")
  assert.match(scanLines("const s = 'abc'")[0].code, /^const s = '\s+'$/)
})

test('the scanner skips regex literals and divisions', () => {
  assert.equal(commentLineCount('const r = /a\\/\\/b[/]/g\nconst d = a / b // c'), 0)
  assert.equal(countTimers('const r = /setTimeout(/'), 0)
})

test('the scanner counts line, block and JSX comments', () => {
  const text = [
    '// one',
    '/*',
    ' * two',
    ' * three',
    ' */',
    '<p>{/* four */}</p>',
    '{/* five */}',
    'const x = 1 // trailing',
  ].join('\n')
  assert.equal(commentLineCount(text), 6)
})

test('the scanner reads template literals with nested expressions', () => {
  const text = 'const s = `a // b ${x ? `// c` : "// d"} ${y} // e`\n// real'
  assert.equal(commentLineCount(text), 1)
  assert.equal(countEffects('const s = `useEffect(${1})`'), 0)
})

test('citations and reference directives are not counted', () => {
  assert.equal(
    commentLineCount(
      '// source: Daniels 2005, table 2\n/* source: x */\n/// <reference types="vite/client" />',
    ),
    0,
  )
  assert.equal(commentLineCount('// sources are listed below'), 1)
})

test('effects, timers and type escapes are counted in code only', () => {
  assert.equal(
    countEffects(
      'useEffect(() => {}, [])\nReact.useLayoutEffect(f)\n// useEffect(x)\nconst a = "useEffect("',
    ),
    2,
  )
  assert.equal(
    countTimers(
      'setTimeout(f, 1)\nwindow.setInterval(f, 1)\nrequestAnimationFrame(f)\nclearTimeout(t)\n// queueMicrotask(f)',
    ),
    3,
  )
  assert.equal(
    countTypeEscapes(
      '// @ts-ignore\nconst a = b as any\nconst c = d as unknown as E\nconst s = "as any"\n/* @ts-expect-error */',
    ),
    4,
  )
})
