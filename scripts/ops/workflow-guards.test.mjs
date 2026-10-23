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
