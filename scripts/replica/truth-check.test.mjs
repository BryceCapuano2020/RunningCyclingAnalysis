import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseNumber, readCard, runChecks, validateTruth } from './truth-check.mjs'

/* Synthetic page text only: the made-up cards and figures below are not from any account. */

test('reads the first number followed by the unit, whether on one line or two', () => {
  assert.deepEqual(readCard('Threshold power\n250 W\nfrom 3 efforts', 'Threshold power', 'W'), {
    value: 250,
    hedged: [],
  })
  assert.deepEqual(readCard('Threshold power\n250\nW\nfrom 3 efforts', 'Threshold power', 'W'), {
    value: 250,
    hedged: [],
  })
})

test('matches the card title case-insensitively at the start of a line, and skips earlier text', () => {
  const text = 'Run\n3 W\nTHRESHOLD POWER (last 6 weeks)\n1,234.5 W'
  assert.equal(readCard(text, 'threshold power', 'W').value, 1234.5)
  assert.equal(readCard('Your threshold power\n250 W', 'Threshold power', 'W'), null)
})

test('a clock value reads as seconds, so a pace card can be checked', () => {
  assert.equal(parseNumber('5:30'), 330)
  assert.equal(parseNumber('1:05:30'), 3930)
  assert.equal(parseNumber('1,234'), 1234)
  assert.equal(parseNumber('1:2:3:4'), null)
  assert.equal(parseNumber('.'), null)
  assert.equal(readCard('Easy pace\n5:30 /km', 'Easy pace', '/km').value, 330)
})

test('a unit matches only as a whole unit, with regex characters taken literally', () => {
  assert.equal(readCard('Gap\n4.5 %\n', 'Gap', '%').value, 4.5)
  assert.equal(readCard('Power\n3.1 W/kg\n250 W', 'Power', 'W').value, 250)
  assert.equal(readCard('Power\n250 Watts', 'Power', 'W').value, null)
  assert.equal(readCard('Pace\n5 xkm', 'Pace', '.km').value, null)
})

test('a hedge word between the title and the number is reported, in any case', () => {
  const text = 'Threshold power\nAbout\nroughly 250 W is the best guess\n250 W'
  assert.deepEqual(readCard(text, 'Threshold power', 'W', ['ABOUT', 'Roughly']), {
    value: 250,
    hedged: ['About', 'roughly 250 W is the best guess'],
  })
  assert.deepEqual(
    readCard('Threshold power\n250 W\nabout 3 efforts', 'Threshold power', 'W', ['ABOUT']).hedged,
    [],
  )
})

test('a card with no title is null, and one with no number within reach has a null value', () => {
  assert.equal(readCard('Something else\n250 W', 'Threshold power', 'W'), null)
  const far = ['Threshold power', ...Array(11).fill('note'), '250 W'].join('\n')
  assert.deepEqual(readCard(far, 'Threshold power', 'W'), { value: null, hedged: [] })
  const near = ['Threshold power', ...Array(10).fill('note'), '250 W'].join('\n')
  assert.equal(readCard(near, 'Threshold power', 'W').value, 250)
})

const goodCheck = {
  id: 'run-threshold',
  page: 'run',
  card: 'Threshold power',
  unit: 'W',
  periods: ['default'],
  expect: 250,
  tolerance: 5,
}

test('a truth file must name its checks and give each one the fields it is read with', () => {
  assert.equal(validateTruth({ checks: [goodCheck] }).checks.length, 1)
  assert.throws(() => validateTruth({}), /"checks" list/)
  assert.throws(
    () => validateTruth({ checks: [{ ...goodCheck, expect: '250' }] }),
    /run-threshold.*"expect" must be a number/,
  )
  assert.throws(() => validateTruth({ checks: [{ ...goodCheck, tolerance: -1 }] }), /"tolerance"/)
  assert.throws(() => validateTruth({ checks: [{ ...goodCheck, periods: [] }] }), /"periods"/)
  assert.throws(
    () => validateTruth({ checks: [{ ...goodCheck, card: '' }] }),
    /"card" must be text/,
  )
  assert.throws(() => validateTruth({ checks: [], hedges: { words: [3] } }), /"hedges.words"/)
})

/** An output folder holding the given page files, removed after the callback. */
function withOutput(files, run) {
  const dir = mkdtempSync(join(tmpdir(), 'rca-truth-'))
  try {
    for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
    return run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('each check and period passes, fails or is missing on its own', () => {
  const truth = {
    hedges: { words: ['about'] },
    checks: [
      { ...goodCheck, periods: ['default', 'all-time', '6-weeks', '12-weeks'] },
      { ...goodCheck, id: 'ride-threshold', page: 'ride', periods: ['default'] },
    ],
  }
  const files = {
    'run-default.txt': 'Threshold power\n253 W\n',
    'run-all-time.txt': 'Threshold power\n260 W\n',
    'run-6-weeks.txt': 'Threshold power\nabout\n250 W\n',
    'ride-default.txt': 'Threshold power\nNot enough hard efforts yet\n',
  }
  const results = withOutput(files, (dir) => runChecks(dir, truth))
  assert.deepEqual(
    results.map(({ verdict }) => verdict),
    ['PASS', 'FAIL', 'FAIL', 'MISSING', 'FAIL'],
  )
  assert.deepEqual(
    results.slice(0, 3).map(({ line }) => line),
    [
      'PASS run-threshold default: 253 W, want 250 ± 5',
      'FAIL run-threshold all-time: 260 W, want 250 ± 5',
      'FAIL run-threshold 6-weeks: 250 W, want 250 ± 5, hedged: about',
    ],
  )
  assert.match(results[3].line, /^MISSING run-threshold 12-weeks: no .*run-12-weeks\.txt$/)
  assert.equal(results[4].line, 'FAIL ride-threshold default: no number W, want 250 ± 5')
})

const script = fileURLToPath(new URL('./truth-check.mjs', import.meta.url))
const check = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })

test('the command exits 0 when every check passes, 1 when one fails, 2 on bad usage or a bad truth file', () => {
  withOutput(
    {
      'run-default.txt': 'Threshold power\n250 W\n',
      'truth.json': JSON.stringify({ checks: [goodCheck] }),
    },
    (dir) => {
      const truth = join(dir, 'truth.json')
      const pass = check(dir, truth)
      assert.equal(pass.status, 0)
      assert.match(pass.stdout, /PASS run-threshold default[^\n]*\nall checks pass\n$/)

      writeFileSync(truth, JSON.stringify({ checks: [{ ...goodCheck, expect: 300 }] }))
      const fail = check(dir, truth)
      assert.equal(fail.status, 1)
      assert.match(fail.stdout, /FAIL run-threshold default: 250 W, want 300 ± 5\n1 failing\n$/)

      assert.equal(check(dir).status, 2)
      writeFileSync(truth, '{ "secret": 41')
      const broken = check(dir, truth)
      assert.equal(broken.status, 2)
      assert.doesNotMatch(broken.stderr, /secret|41/)
      writeFileSync(truth, '{}')
      assert.match(check(dir, truth).stderr, /"checks" list/)
    },
  )
})
