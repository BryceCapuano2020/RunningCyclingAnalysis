import { afterEach, describe, expect, it, vi } from 'vitest'
import { runMaintenance } from './maintenance.ts'
import { createHarness, START } from './test/harness.ts'
import { at, countOf } from './test/maintenance.ts'

afterEach(() => vi.restoreAllMocks())

describe('the database size step', () => {
  it('fails alone: the run still reports, the last size stays, and the log names only the error class', async () => {
    const h = createHarness()
    await h.signIn()
    await h.env.DB.prepare(
      `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations,
         monthly_put_bytes, d1_size_bytes) VALUES (1, 0, '2026-01', 0, 0, 4321)
       ON CONFLICT(id) DO UPDATE SET d1_size_bytes = excluded.d1_size_bytes`,
    ).run()
    const failing = new Proxy(h.env.DB, {
      get(target, property) {
        if (property === 'prepare') {
          return (query: string) => {
            if (query === 'SELECT 1') throw new TypeError('D1_ERROR: synthetic outage')
            return target.prepare(query)
          }
        }
        const value: unknown = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const report = await runMaintenance({ ...h.env, DB: failing }, at(START))
    expect(report).toMatchObject({ countersChecked: 1, budgetReached: false })
    expect(error.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([
      { event: 'database_size_failed', errorClass: 'TypeError' },
    ])
    expect(await countOf('SELECT d1_size_bytes AS n FROM r2_storage_budget WHERE id = 1')).toBe(
      4321,
    )
  })
})
