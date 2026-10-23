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

test('deployment checks Worker secret names before applying migrations', async () => {
  const source = await workflow('deploy')
  const secretCheck = source.indexOf('node scripts/ops/check-worker-secrets.mjs')
  const migrations = source.indexOf('wrangler d1 migrations apply rca --remote')
  assert.ok(secretCheck >= 0)
  assert.ok(migrations > secretCheck)
})
