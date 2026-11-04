import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  parseNumber,
  readBest60,
  readCard,
  runChecks,
  runInvariants,
  validateTruth,
} from './truth-check.mjs'

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

test('a card that shows no number does not read the number of the card after it', () => {
  const both = ['Ride threshold', 'Run threshold']
  // The next card is another check's title.
  const text = 'Ride threshold\nNot enough hard efforts yet\nRun threshold\n250 W'
  assert.deepEqual(readCard(text, 'Ride threshold', 'W', [], both), { value: null, hedged: [] })
  assert.equal(readCard(text, 'Run threshold', 'W', [], both).value, 250)
  // The next card is a title no check names: an all-caps line after ordinary text.
  const caps =
    'THRESHOLD POWER\nNot enough hard efforts yet\nAGE GRADE, BEST 20 MIN\n246 W at age 35.'
  assert.equal(readCard(caps, 'Threshold power', 'W').value, null)
  // All-caps badges straight after the title belong to the card.
  const badges = 'THRESHOLD POWER\n· ALL TIME\nESTIMATED\nHARD EFFORT\n225\nW'
  assert.equal(readCard(badges, 'Threshold power', 'W').value, 225)
  // A title that is only the start of this card's title is not another card.
  assert.equal(readCard('Run threshold\n250 W', 'Run threshold', 'W', [], ['Run']).value, 250)
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

test('a check whose card shows no number fails even when the next card has one', () => {
  const truth = {
    checks: [
      { ...goodCheck, id: 'ride-threshold', card: 'Ride threshold' },
      { ...goodCheck, id: 'run-threshold', card: 'Run threshold' },
    ],
  }
  const files = {
    'run-default.txt': 'Ride threshold\nNot enough hard efforts yet\nRun threshold\n250 W\n',
  }
  const lines = withOutput(files, (dir) => runChecks(dir, truth).map(({ line }) => line))
  assert.deepEqual(lines, [
    'FAIL ride-threshold default: no number W, want 250 ± 5',
    'PASS run-threshold default: 250 W, want 250 ± 5',
  ])
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
      assert.match(
        pass.stdout,
        /PASS run-threshold default[^\n]*\n0 contradiction checks ran\nall checks pass\n$/,
      )

      writeFileSync(truth, JSON.stringify({ checks: [{ ...goodCheck, expect: 300 }] }))
      const fail = check(dir, truth)
      assert.equal(fail.status, 1)
      assert.match(
        fail.stdout,
        /FAIL run-threshold default: 250 W, want 300 ± 5\n0 contradiction checks ran\n1 failing\n$/,
      )

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

test('reads the best 60 min a sport page labels, the current period first', () => {
  assert.equal(readBest60('20 MIN\n7:40 /mi\n60 MIN\n8:05 /mi\n9:10 /mi', '/mi'), 485)
  assert.equal(readBest60('60 MIN\n220 W\n2.9 W/kg', 'W'), 220)
  assert.equal(readBest60('20 MIN\n250 W', 'W'), null)
})

test('fails a threshold slower than the best 60 min on its own page, for either sport', () => {
  withOutput(
    {
      'run-6-weeks.txt': 'THRESHOLD PACE\n8:10\n/mi\nrange\n60 MIN\n8:05 /mi\n',
      'run-12-months.txt': 'THRESHOLD PACE\n7:30\n/mi\n60 MIN\n7:45 /mi\n',
      'ride-6-weeks.txt': 'THRESHOLD POWER\n200\nW\n60 MIN\n210 W\n',
      'ride-12-months.txt': 'THRESHOLD POWER\n250\nW\n60 MIN\n220 W\n',
      'run-all-time.txt': 'THRESHOLD PACE\n7:00\n/mi\n',
    },
    (dir) => {
      const lines = runInvariants(dir).map(({ line }) => line)
      assert.deepEqual(lines, [
        'PASS threshold-vs-hour ride-12-months: threshold 250 W, best 60 min 220 W',
        'FAIL threshold-vs-hour ride-6-weeks: threshold 200 W, best 60 min 210 W',
        'PASS threshold-vs-hour run-12-months: threshold 450 s, best 60 min 465 s /mi',
        'FAIL threshold-vs-hour run-6-weeks: threshold 490 s, best 60 min 485 s /mi',
      ])
    },
  )
})

test('fails a Balance page whose ride-as-a-run card contradicts its lean', () => {
  const page = (lean, run, ride) =>
    `YOUR BALANCE LEANS TOWARD ${lean}\nRUN THRESHOLD\n${run}\n/mi\nRIDE THRESHOLD\n250\nW\nYOUR RIDE AS A RUN\n${ride}\n/mi\n`
  withOutput(
    {
      'balance-6-weeks.txt': page('RUNNING', '8:00', '7:50'),
      'balance-12-months.txt': page('RUNNING', '7:30', '8:20'),
      'balance-all-time.txt': page('CYCLING', '7:30', '7:10'),
      'balance-default.txt': 'YOUR BALANCE LEANS TOWARD RUNNING\nRUN THRESHOLD\n7:30\n/mi\n',
    },
    (dir) => {
      const verdicts = runInvariants(dir).map(({ line }) => line.split(':')[0])
      assert.deepEqual(verdicts, [
        'PASS lean-vs-cards balance-12-months',
        'FAIL lean-vs-cards balance-6-weeks',
        'PASS lean-vs-cards balance-all-time',
      ])
    },
  )
})

test('fails a Balance threshold that differs from the same period on the sport page', () => {
  const balance = (run, ride) =>
    `RUN THRESHOLD\n${run}\n/mi\nRIDE THRESHOLD\n${ride}\nW\nYOUR RIDE AS A RUN\n8:00\n/mi\n`
  withOutput(
    {
      'balance-12-months.txt': balance('7:30', '250'),
      'run-12-months.txt': 'THRESHOLD PACE\n7:30\n/mi\n',
      'ride-12-months.txt': 'THRESHOLD POWER\n250\nW\n',
      'balance-6-weeks.txt': balance('7:30', '250'),
      'run-6-weeks.txt': 'THRESHOLD PACE\n7:45\n/mi\n',
      'ride-6-weeks.txt': 'THRESHOLD POWER\n262\nW\n',
      'balance-all-time.txt': balance('7:30', '250'),
    },
    (dir) => {
      const lines = runInvariants(dir)
        .map(({ line }) => line)
        .filter((line) => line.includes('balance-vs-sport'))
      assert.deepEqual(lines, [
        'PASS balance-vs-sport-run-threshold balance-12-months: Balance 450 s, run page 450 s /mi',
        'PASS balance-vs-sport-ride-threshold balance-12-months: Balance 250 W, ride page 250 W',
        'FAIL balance-vs-sport-run-threshold balance-6-weeks: Balance 450 s, run page 465 s /mi',
        'FAIL balance-vs-sport-ride-threshold balance-6-weeks: Balance 250 W, ride page 262 W',
      ])
    },
  )
})

test('fails a Balance grade that differs from the sport page’s age grade at threshold for the same period', () => {
  const sportPage = (level, percent) => `AGE GRADE AT THRESHOLD\n${level}\n${percent}\n`
  withOutput(
    {
      'balance-12-months.txt': 'RUNNING\n47%\nRecreational\nCYCLING\n72%\nRegional\n',
      'run-12-months.txt': sportPage('RECREATIONAL', '47%'),
      'ride-12-months.txt': sportPage('REGIONAL', '72%'),
      'balance-6-weeks.txt': 'RUNNING\n47%\nRecreational\nCYCLING\n72%\nRegional\n',
      'run-6-weeks.txt': sportPage('RECREATIONAL', '48%'),
      'ride-6-weeks.txt': sportPage('NATIONAL', '72%'),
      'balance-all-time.txt': 'RUNNING\n47%\nRecreational\nCYCLING\n72%\nRegional\n',
    },
    (dir) => {
      const lines = runInvariants(dir)
        .map(({ line }) => line)
        .filter((line) => line.includes('-grade '))
      assert.deepEqual(lines, [
        'PASS balance-vs-sport-run-grade balance-12-months: Balance 47% Recreational, run page 47% RECREATIONAL',
        'PASS balance-vs-sport-ride-grade balance-12-months: Balance 72% Regional, ride page 72% REGIONAL',
        'FAIL balance-vs-sport-run-grade balance-6-weeks: Balance 47% Recreational, run page 48% RECREATIONAL',
        'FAIL balance-vs-sport-ride-grade balance-6-weeks: Balance 72% Regional, ride page 72% NATIONAL',
      ])
    },
  )
})

test('the command fails on a contradiction even when every truth check passes', () => {
  withOutput(
    {
      'run-default.txt': 'Threshold power\n250 W\n',
      'run-6-weeks.txt': 'THRESHOLD PACE\n8:10\n/mi\n60 MIN\n8:05 /mi\n',
      'truth.json': JSON.stringify({ checks: [goodCheck] }),
    },
    (dir) => {
      const run = check(dir, join(dir, 'truth.json'))
      assert.equal(run.status, 1)
      assert.match(
        run.stdout,
        /PASS run-threshold default[^\n]*\nFAIL threshold-vs-hour run-6-weeks[^\n]*\n1 contradiction checks ran\n1 failing\n$/,
      )
    },
  )
})
