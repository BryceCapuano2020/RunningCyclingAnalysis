import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildResetSql } from './reset-r2-budget.mjs'

test('sets only the named month counters, guarded by that month', () => {
  assert.equal(
    buildResetSql({ period: '2026-10', putBytes: 1024, operations: 5 }),
    "UPDATE r2_storage_budget SET monthly_put_bytes = 1024, monthly_operations = 5 WHERE id = 1 AND monthly_period = '2026-10';",
  )
})

test('defaults both counters to zero and never names the lifetime audit total', () => {
  const sql = buildResetSql({ period: '2026-11' })
  assert.match(sql, /monthly_put_bytes = 0, monthly_operations = 0/)
  assert.doesNotMatch(sql, /lifetime/)
})

test('refuses malformed months and out-of-range counters', () => {
  assert.throws(() => buildResetSql({ period: '2026-13' }), /YYYY-MM/)
  assert.throws(() => buildResetSql({ period: '26-10' }), /YYYY-MM/)
  assert.throws(() => buildResetSql({ period: '2026-10', putBytes: -1 }), /--put-bytes/)
  assert.throws(() => buildResetSql({ period: '2026-10', operations: 100_001 }), /--operations/)
  assert.throws(() => buildResetSql({ period: '2026-10', putBytes: 1.5 }), /--put-bytes/)
})
