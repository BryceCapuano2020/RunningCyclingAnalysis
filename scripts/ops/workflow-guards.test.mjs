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

test('statistical simulations run in their own job, without coverage, and never inside the unit-test job', async () => {
  const blocks = jobBlocks(await workflow('ci'))
  const verify = blocks.get('verify').join('\n')
  const sim = blocks.get('sim').join('\n')
  assert.doesNotMatch(verify, /test:sim/)
  assert.match(sim, /^ {4}name: Statistical simulations$/m)
  assert.match(sim, /^ {6}- run: npm run test:sim$/m)
  assert.doesNotMatch(sim, /coverage/)
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
  assert.match(
    pkg.scripts.check,
    /npm run test:sim/,
    'check runs the simulations the unit run skips',
  )
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

test('documentation-only pull requests skip the long CI work, and everything else runs it', async () => {
  const blocks = jobBlocks(await workflow('ci'))
  const changes = blocks.get('changes').join('\n')
  assert.match(changes, /if \[ "\$EVENT" != pull_request \]; then\n\s+echo "code=true"/)
  assert.match(changes, /git diff --name-only --no-renames HEAD\^1 HEAD/)
  assert.doesNotMatch(
    changes,
    /grep -q/,
    'grep -q can exit early and trip pipefail into a false docs-only',
  )
  for (const job of ['perf', 'sim', 'unit', 'e2e']) {
    const block = blocks.get(job).join('\n')
    assert.match(block, /^ {4}needs: changes$/m, job)
    assert.match(
      block,
      /^ {4}if: \$\{\{ !cancelled\(\) && needs\.changes\.outputs\.code != 'false' \}\}$/m,
      `${job} skips only on an explicit 'false', so a failed classification runs it`,
    )
  }
  const staticJob = blocks.get('static').join('\n')
  assert.match(staticJob, /^ {4}if: \$\{\{ !cancelled\(\) \}\}$/m)
  for (const step of ['typecheck', 'build']) {
    assert.match(
      staticJob,
      new RegExp(`- run: npm run ${step}\\n {8}if: needs\\.changes\\.outputs\\.code != 'false'`),
      step,
    )
  }
  for (const step of ['format:check', 'lint', 'test:deploy-config', 'test:ops']) {
    assert.match(staticJob, new RegExp(`- run: npm run ${step}\\n {6}[-#]`), `${step} always runs`)
  }
  assert.match(
    staticJob,
    /if: needs\.changes\.outputs\.code == 'false'\n\s+run: \|\n\s+files=\$\(git grep -l -F '\.md'/,
  )
})

test('every push to main gets its own CI run, and only pull request runs are cancelled', async () => {
  const ci = await workflow('ci')
  assert.match(
    ci,
    /^ {2}group: ci-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event_name == 'pull_request' && github\.ref \|\| github\.sha \}\}$/m,
  )
})

test('the required checks collect their shards and pass a skipped shard only on a docs-only run', async () => {
  const blocks = jobBlocks(await workflow('ci'))
  const verify = blocks.get('verify').join('\n')
  assert.match(verify, /^ {4}name: Lint, typecheck, unit tests, build$/m)
  assert.match(verify, /^ {4}needs: \[changes, static, unit\]$/m)
  assert.match(verify, /^ {4}if: \$\{\{ !cancelled\(\) \}\}$/m, 'the required check always reports')
  assert.match(verify, /if \[ "\$STATIC" != success \]; then/)
  assert.match(verify, /if \[ "\$UNIT" = skipped \] && \[ "\$CODE" = false \]; then exit 0; fi/)
  assert.match(verify, /if \[ "\$UNIT" != success \]; then/)
  assert.match(verify, /npx vitest --mergeReports \.vitest\/blob --coverage/)
  const result = blocks.get('e2e-result').join('\n')
  assert.match(result, /^ {4}name: End-to-end \(Playwright\)$/m)
  assert.match(result, /^ {4}needs: \[changes, e2e\]$/m)
  assert.match(result, /^ {4}if: \$\{\{ !cancelled\(\) \}\}$/m)
  assert.match(result, /if \[ "\$E2E" = skipped \] && \[ "\$CODE" = false \]; then exit 0; fi/)
  assert.match(result, /if \[ "\$E2E" != success \]; then/)
})

test('shards cover the whole suite: the shard count comes from the matrix, and only the merge applies coverage thresholds', async () => {
  const blocks = jobBlocks(await workflow('ci'))
  const unit = blocks.get('unit').join('\n')
  assert.match(unit, /--shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}/)
  assert.match(unit, /fail-fast: false/)
  assert.match(unit, /COVERAGE_SHARD: '1'/)
  assert.doesNotMatch(unit, /test:sim|test:perf/)
  const e2e = blocks.get('e2e').join('\n')
  assert.match(e2e, /--shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}/)
  assert.match(e2e, /fail-fast: false/)
  assert.match(e2e, /- run: npm run e2e:worker -w @rca\/web\n {8}if: matrix\.shard == 1/)
  const config = await readFile(new URL('vitest.config.ts', root), 'utf8')
  assert.match(config, /thresholds: process\.env\.COVERAGE_SHARD\s*\?\s*undefined/)
})
