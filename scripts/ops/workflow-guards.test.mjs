import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../../', import.meta.url)
const workflow = (name) => readFile(new URL(`.github/workflows/${name}.yml`, root), 'utf8')

test('automatic rollback only targets a configured compatible version and otherwise records skip', async () => {
  const source = await workflow('deploy')
  assert.match(source, /vars\.RCA_SAFE_ROLLBACK_VERSION != ''/)
  assert.match(source, /wrangler rollback "\$SAFE_ROLLBACK_VERSION" --yes/)
  assert.match(source, /vars\.RCA_SAFE_ROLLBACK_VERSION == ''/)
  assert.doesNotMatch(source, /wrangler rollback --yes\s*--message/)
})

test('backup and uptime schedules are opt-in while manual dispatch remains available', async () => {
  const backup = await workflow('backup')
  const uptime = await workflow('uptime')
  assert.match(
    backup,
    /github\.event_name == 'workflow_dispatch' \|\| vars\.RCA_BACKUP_ENABLED == 'true'/,
  )
  assert.match(
    uptime,
    /github\.event_name == 'workflow_dispatch' \|\| vars\.RCA_UPTIME_ENABLED == 'true'/,
  )
  assert.match(backup, /check-backup-recipient\.mjs/)
})

test('backup validates recipients with age before exporting account data', async () => {
  const backup = await workflow('backup')
  const ageInstall = backup.indexOf('name: Install age')
  const recipientValidation = backup.indexOf(
    'age -R ops/backup-recipient.txt < /dev/null > /dev/null',
  )
  const exportData = backup.indexOf('name: Export D1 and list R2 objects')
  assert.ok(ageInstall >= 0)
  assert.ok(recipientValidation > ageInstall)
  assert.ok(exportData > recipientValidation)
})

test('deployment checks Worker secret names before applying migrations', async () => {
  const source = await workflow('deploy')
  const secretCheck = source.indexOf('node scripts/ops/check-worker-secrets.mjs')
  const migrations = source.indexOf('wrangler d1 migrations apply rca --remote')
  assert.ok(secretCheck >= 0)
  assert.ok(migrations > secretCheck)
})

test('CI and Deploy preserve hidden files in the static build artifact', async () => {
  const ci = await workflow('ci')
  const deploy = await workflow('deploy')
  assert.match(
    ci,
    /name: dist\n\s+path: apps\/web\/dist\n\s+retention-days: 7\n\s+include-hidden-files: true/,
  )
  assert.match(
    deploy,
    /name: production-dist\n\s+path: apps\/web\/dist\n\s+retention-days: 7\n\s+include-hidden-files: true/,
  )
  assert.match(ci, /- run: npm run test:ops/)
})

test('manual uptime runs can simulate an outage without reading inputs in shell steps', async () => {
  const uptime = await workflow('uptime')
  assert.match(
    uptime,
    /workflow_dispatch:\n {4}inputs:\n {6}simulate_outage:\n {8}description: [^\n]*\n(?: {10}[^\n]+\n)*? {8}type: boolean\n {8}default: false/,
  )
  assert.match(
    uptime,
    /ORIGIN: \$\{\{ inputs\.simulate_outage == true && 'https:\/\/simulated-outage\.invalid' \|\| vars\.PRODUCTION_ORIGIN/,
  )
  const steps = uptime.slice(uptime.indexOf('steps:'))
  assert.doesNotMatch(steps, /\$\{\{\s*inputs\./)
})

test('a skipped deep health check warns and neither opens nor closes the outage issue', async () => {
  const uptime = await workflow('uptime')
  assert.match(uptime, /::warning title=Deep health skipped::/)
  assert.match(uptime, /echo "deep=\$deep_state" >> "\$GITHUB_OUTPUT"/)
  assert.match(
    uptime,
    /name: Close outage issues after recovery\n {8}if: steps\.probe\.outputs\.failed == 'false' && steps\.probe\.outputs\.deep != 'skipped'/,
  )
  assert.match(
    uptime,
    /name: Open or update the outage issue\n {8}if: steps\.probe\.outputs\.failed == 'true'/,
  )
})

const jobBlocks = (source) => {
  const lines = source.split('\n')
  const blocks = new Map()
  let current = null
  for (const line of lines.slice(lines.indexOf('jobs:') + 1)) {
    const job = /^ {2}([A-Za-z0-9_-]+):$/.exec(line)
    if (job) {
      current = job[1]
      blocks.set(current, [])
    } else if (current) {
      blocks.get(current).push(line)
    }
  }
  return blocks
}

test('every CI and Deploy job has a timeout so a hang fails instead of running for hours', async () => {
  for (const name of ['ci', 'deploy']) {
    const blocks = jobBlocks(await workflow(name))
    assert.ok(blocks.size > 0)
    for (const [job, lines] of blocks) {
      assert.match(lines.join('\n'), /^ {4}timeout-minutes: [1-9]\d*$/m, `${name} job ${job}`)
    }
  }
})

test('browser jobs run in the Playwright image pinned to the locked version and digest', async () => {
  const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'))
  const version = lock.packages['node_modules/@playwright/test'].version
  const escaped = version.replaceAll('.', '\\.')
  const image = new RegExp(
    `image: mcr\\.microsoft\\.com/playwright:v${escaped}-noble@sha256:[0-9a-f]{64}`,
  )
  let browserJobs = 0
  for (const name of ['ci', 'deploy']) {
    const source = await workflow(name)
    assert.doesNotMatch(source, /--with-deps/)
    for (const [job, lines] of jobBlocks(source)) {
      const block = lines.join('\n')
      if (!/npm run (e2e|verify:release)/.test(block)) continue
      browserJobs += 1
      assert.match(block, /^ {4}container:\n {6}image: /m, `${name} job ${job}`)
      assert.match(block, image, `${name} job ${job}`)
      assert.match(block, /HOME: \/root/, `${name} job ${job}`)
    }
  }
  assert.equal(browserJobs, 2)
})

test('npm retries transient registry failures before a dependency install fails', async () => {
  for (const name of ['ci', 'deploy']) {
    assert.match(await workflow(name), /npm_config_fetch_retries: '5'/)
  }
})

test('wall-clock budgets run in their own job, retried once, and never inside the unit-test job', async () => {
  const blocks = jobBlocks(await workflow('ci'))
  const verify = blocks.get('verify').join('\n')
  const perf = blocks.get('perf').join('\n')
  assert.match(verify, /^ {4}name: Lint, typecheck, unit tests, build$/m)
  assert.doesNotMatch(verify, /test:perf/)
  assert.match(perf, /^ {4}name: Performance budgets$/m)
  const runs = perf.match(/npm run test:perf/g) ?? []
  assert.equal(runs.length, 2, 'one run, and one retry after a failure')
  assert.match(perf, /if ! npm run test:perf; then/)
})

test('a deploy records the commit on the Worker version and the live /api/health must report it', async () => {
  const deploy = await workflow('deploy')
  assert.match(deploy, /--define "__BUILD_SHA__:\\"\$\{GITHUB_SHA::8\}\\""/)
  assert.match(deploy, /node scripts\/ops\/smoke\.mjs --expect-sha "\$GITHUB_SHA"/)
  const api = JSON.parse(await readFile(new URL('apps/api/package.json', root), 'utf8'))
  const script = api.scripts['deploy:built']
  assert.match(
    script,
    /^node scripts\/check-deploy-config\.mjs/,
    'the configuration is checked first',
  )
  assert.match(
    script,
    /deploy-built\.mjs$/,
    'the last step is the tagged deploy, not a bare wrangler deploy',
  )
  assert.doesNotMatch(script, /wrangler deploy/)
})
