import assert from 'node:assert/strict'
import { test } from 'node:test'
import { actionText, capLine, latestChecks, OPEN_CAP, queue, verdict } from './pr-queue.mjs'

const AT = '2026-10-31T01:00:00Z'
const LATER = '2026-10-31T01:10:00Z'
const done = (name, conclusion, startedAt = AT) => ({
  __typename: 'CheckRun',
  name,
  status: 'COMPLETED',
  conclusion,
  startedAt,
})
const queued = (name, startedAt = null) => ({
  __typename: 'CheckRun',
  name,
  status: 'QUEUED',
  conclusion: '',
  startedAt,
})
const CI = [
  'Changed files',
  'Lint, typecheck, build',
  'Unit tests (1 of 2)',
  'Unit tests (2 of 2)',
  'Lint, typecheck, unit tests, build',
  'Performance budgets',
  'Simulations (1 of 2)',
  'Simulations (2 of 2)',
  'Statistical simulations',
  'Unit tests in shuffled order',
  'End-to-end (1 of 3)',
  'End-to-end (2 of 3)',
  'End-to-end (3 of 3)',
  'End-to-end (Playwright)',
  'Pull request size',
  'Dependency audit',
  'CI result',
]
/** A code pull request's checks, all green unless `results` says otherwise. */
const checks = (results = {}) => CI.map((name) => done(name, results[name] ?? 'SUCCESS'))
const pr = (fields = {}) => ({
  number: 7,
  title: 'A change',
  isDraft: false,
  mergeStateStatus: 'BLOCKED',
  autoMergeRequest: { mergeMethod: 'SQUASH' },
  statusCheckRollup: checks(),
  ...fields,
})

test('a ready pull request whose run skipped everything as a draft needs a new run', () => {
  // The shape #213, #227 and #232 had: marked ready, but the only run saw a draft.
  const rollup = CI.map((name) =>
    name === 'Lint, typecheck, unit tests, build' || name === 'End-to-end (Playwright)'
      ? done(name, 'FAILURE')
      : done(name, name === 'Unit tests in shuffled order' ? 'SUCCESS' : 'SKIPPED'),
  )
  const result = verdict(pr({ statusCheckRollup: rollup }))
  assert.equal(result.kind, 'stale-draft-run')
  assert.match(result.detail, /re-run all jobs or push a commit/)
})

test('a draft is a draft whatever its checks say, with a conflict noted', () => {
  assert.deepEqual(verdict(pr({ isDraft: true, statusCheckRollup: [] })), {
    kind: 'draft',
    detail: '',
  })
  assert.equal(
    verdict(pr({ isDraft: true, mergeStateStatus: 'DIRTY' })).detail,
    'conflict with main',
  )
})

test('a failed shard is named instead of the required check that collects it', () => {
  const result = verdict(
    pr({
      statusCheckRollup: checks({
        'Unit tests (1 of 2)': 'FAILURE',
        'Lint, typecheck, unit tests, build': 'FAILURE',
      }),
    }),
  )
  assert.equal(result.kind, 'failing')
  assert.equal(result.detail, 'Unit tests (1 of 2) (failure)')
})

test('a required check that failed on its own, such as merged coverage, is named', () => {
  const result = verdict(
    pr({ statusCheckRollup: checks({ 'Lint, typecheck, unit tests, build': 'FAILURE' }) }),
  )
  assert.equal(result.detail, 'Lint, typecheck, unit tests, build (failure)')
})

test('the shuffled-order job is reported but does not hold a green pull request', () => {
  const result = verdict(
    pr({ statusCheckRollup: checks({ 'Unit tests in shuffled order': 'FAILURE' }) }),
  )
  assert.equal(result.kind, 'merging')
  assert.match(result.detail, /not required, failing: Unit tests in shuffled order/)
})

test('only the newest run of a check counts, and a queued check is always the newest', () => {
  const replaced = [...checks(), done('Performance budgets', 'CANCELLED', '2026-10-31T00:50:00Z')]
  assert.equal(verdict(pr({ statusCheckRollup: replaced })).kind, 'merging')
  const latest = latestChecks([
    done('Performance budgets', 'CANCELLED', LATER),
    queued('Performance budgets'),
  ])
  assert.equal(latest.get('Performance budgets').done, false)
  const restarted = [
    ...checks({ 'Performance budgets': 'CANCELLED' }),
    queued('Performance budgets'),
  ]
  assert.equal(verdict(pr({ statusCheckRollup: restarted })).kind, 'running')
})

test('green without auto-merge prints the command that turns it on', () => {
  const result = verdict(pr({ number: 42, autoMergeRequest: null }))
  assert.equal(result.kind, 'no-auto-merge')
  assert.match(result.detail, /gh pr merge --auto --squash 42/)
})

test('a conflict, a pull request with no run yet and a commit status are each reported', () => {
  assert.equal(verdict(pr({ mergeStateStatus: 'DIRTY' })).kind, 'conflict')
  assert.equal(verdict(pr({ statusCheckRollup: [] })).kind, 'no-checks')
  const status = { __typename: 'StatusContext', context: 'external', state: 'ERROR', startedAt: AT }
  assert.deepEqual(verdict(pr({ statusCheckRollup: [...checks(), status] })), {
    kind: 'failing',
    detail: 'external (failure)',
  })
})

test('the queue puts pull requests that need someone first and drafts last', () => {
  const rows = queue([
    pr({ number: 1, isDraft: true }),
    pr({ number: 2 }),
    pr({ number: 3, statusCheckRollup: checks({ 'Dependency audit': 'FAILURE' }) }),
    pr({ number: 4, statusCheckRollup: [...checks(), queued('End-to-end (1 of 3)', LATER)] }),
  ])
  assert.deepEqual(
    rows.map((row) => [row.number, row.kind]),
    [
      [3, 'failing'],
      [4, 'running'],
      [2, 'merging'],
      [1, 'draft'],
    ],
  )
})

test('--action names only what needs someone, and is silent when nothing does', () => {
  const rows = queue([
    pr({ number: 1, isDraft: true }),
    pr({ number: 2, autoMergeRequest: { enabledAt: AT } }),
    pr({ number: 3, autoMergeRequest: null }),
    pr({ number: 4, statusCheckRollup: checks({ 'Performance budgets': 'FAILURE' }) }),
  ])
  const text = actionText('main abc: green', 'green', rows)
  assert.match(text, /^PR queue, needs action/)
  assert.match(text, /#3 {2}no-auto-merge/)
  assert.match(text, /#4 {2}failing/)
  assert.doesNotMatch(text, /#1 |#2 |main abc/)
  assert.equal(
    actionText('main abc: green', 'green', queue([pr({ number: 1, isDraft: true })])),
    '',
  )
  assert.match(actionText('main abc: RED (failure)', 'RED (failure)', []), /main abc: RED/)
})

test('--action says when more pull requests are open than the cap, bots aside', () => {
  const mine = (count, from = 1) =>
    Array.from({ length: count }, (_, i) =>
      pr({ number: from + i, isDraft: true, author: { login: 'someone' } }),
    )
  const bots = [20, 21, 22].map((number) =>
    pr({ number, isDraft: true, author: { login: 'app/dependabot' } }),
  )
  assert.equal(OPEN_CAP, 6)
  assert.equal(capLine(queue([...mine(6), ...bots])), '')
  assert.match(capLine(queue(mine(7))), /^7 pull requests open, cap 6:/)
  const text = actionText('main abc: green', 'green', queue([...mine(7), ...bots]))
  assert.match(text, /^PR queue, needs action/)
  assert.match(text, /\n7 pull requests open, cap 6: .*feature branch/)
  assert.doesNotMatch(text, /#\d/)
})

/** A check in a numbered run and job, the way the rollup carries them. */
const inRun = (run, job, name, conclusion, startedAt = AT) => ({
  ...done(name, conclusion, startedAt),
  workflowName: 'CI',
  detailsUrl: `https://github.com/o/r/actions/runs/${run}/job/${job}`,
})
const fullRun = (run, results = {}, startedAt = AT) =>
  CI.map((name, i) => inRun(run, run * 100 + i, name, results[name] ?? 'SUCCESS', startedAt))

test('a cancelled superseded run beside a green newer run is not a failure', () => {
  const rollup = [
    ...fullRun(10, { 'Statistical simulations': 'CANCELLED', 'Performance budgets': 'FAILURE' }),
    ...fullRun(11, {}, LATER),
  ]
  assert.equal(verdict(pr({ statusCheckRollup: rollup })).kind, 'merging')
})

test('a job that failed in an older run and is absent from the newer run is ignored', () => {
  const rollup = [
    ...fullRun(10, { 'Statistical simulations': 'FAILURE' }),
    ...fullRun(11, {}, LATER).filter((c) => c.name !== 'Statistical simulations'),
  ]
  assert.equal(verdict(pr({ statusCheckRollup: rollup })).kind, 'merging')
  assert.equal(latestChecks(rollup).has('Statistical simulations'), false)
})

test('a re-run attempt that passed after a failed attempt counts as passed', () => {
  const rollup = [
    ...fullRun(10, { 'Performance budgets': 'FAILURE' }),
    inRun(10, 9999, 'Performance budgets', 'SUCCESS', LATER),
  ]
  assert.equal(verdict(pr({ statusCheckRollup: rollup })).kind, 'merging')
  const rerun = [...fullRun(10), inRun(10, 9999, 'Performance budgets', 'FAILURE', LATER)]
  assert.equal(verdict(pr({ statusCheckRollup: rerun })).kind, 'failing')
})

test('a draft-gate run followed by a full green run is green, and alone is stale', () => {
  const draftRun = fullRun(10, {
    'Statistical simulations': 'FAILURE',
    'Lint, typecheck, build': 'SKIPPED',
  })
  assert.equal(verdict(pr({ statusCheckRollup: draftRun })).kind, 'stale-draft-run')
  const both = [...draftRun, ...fullRun(11, {}, LATER)]
  assert.equal(verdict(pr({ statusCheckRollup: both })).kind, 'merging')
})

/** A finished check in run `run`, ended at `end`, as the rollup carries it. */
const endedIn = (run, job, name, conclusion, end) => ({
  ...done(name, conclusion),
  completedAt: end,
  workflowName: 'CI',
  detailsUrl: `https://github.com/o/r/actions/runs/${run}/job/${job}`,
})
const NOW = Date.parse('2026-10-31T02:00:00Z')
const minutesBefore = (m) => new Date(NOW - m * 60_000).toISOString()

test('a run that a push or the ready event just cancelled reads as running, not failing', () => {
  const rollup = [
    ...CI.map((name, i) => endedIn(20, 2000 + i, name, 'CANCELLED', minutesBefore(2))),
    endedIn(20, 2099, 'CI result', 'FAILURE', minutesBefore(2)),
  ]
  const row = verdict(pr({ statusCheckRollup: rollup }), NOW)
  assert.equal(row.kind, 'running')
  assert.equal(actionText('main abc: green', 'green', [{ number: 1, title: 't', ...row }]), '')
})

test('a cancelled run with no newer run after the settle time needs someone', () => {
  const rollup = CI.map((name, i) => endedIn(21, 2100 + i, name, 'CANCELLED', minutesBefore(20)))
  const row = verdict(pr({ statusCheckRollup: rollup }), NOW)
  assert.equal(row.kind, 'stale-draft-run')
  assert.match(row.detail, /cancelled/)
})

test('a run that saw a draft is waited on for the settle time, then flagged', () => {
  const draftRun = (end) =>
    CI.map((name, i) =>
      endedIn(22, 2200 + i, name, name === 'Lint, typecheck, build' ? 'SKIPPED' : 'FAILURE', end),
    )
  assert.equal(verdict(pr({ statusCheckRollup: draftRun(minutesBefore(3)) }), NOW).kind, 'running')
  assert.equal(
    verdict(pr({ statusCheckRollup: draftRun(minutesBefore(15)) }), NOW).kind,
    'stale-draft-run',
  )
})

test('a real failure beside a timed-out (cancelled) job is reported as failing', () => {
  const rollup = CI.map((name, i) =>
    endedIn(
      23,
      2300 + i,
      name,
      i === 2 ? 'FAILURE' : i === 3 ? 'CANCELLED' : 'SUCCESS',
      minutesBefore(20),
    ),
  )
  const row = verdict(pr({ statusCheckRollup: rollup }), NOW)
  assert.equal(row.kind, 'failing')
  assert.match(row.detail, /Unit tests \(1 of 2\) \(failure\)/)
})

test('a cancelled job in a run with jobs still going is running, not flagged', () => {
  const rollup = [
    endedIn(24, 2400, 'Changed files', 'CANCELLED', minutesBefore(20)),
    {
      ...queued('Unit tests (1 of 2)'),
      workflowName: 'CI',
      detailsUrl: 'https://github.com/o/r/actions/runs/24/job/2401',
    },
  ]
  assert.equal(verdict(pr({ statusCheckRollup: rollup }), NOW).kind, 'running')
})
