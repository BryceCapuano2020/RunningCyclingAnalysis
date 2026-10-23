import { describe, expect, it } from 'vitest'
import {
  MAX_GLOBAL_R2_MONTHLY_OPERATIONS,
  MAX_GLOBAL_R2_STANDARD_OPERATIONS,
  MAX_MONTHLY_R2_PUT_BYTES,
  MIN_GLOBAL_R2_PUT_CHARGE_BYTES,
} from '@rca/contract'
import {
  activityFileKey,
  deleteByPrefix,
  deleteByPrefixWithBudget,
  getOriginalFile,
  putOriginalFile,
  releaseR2CleanupBudget,
  reserveR2CleanupBudget,
  reserveR2Operation,
  userFilePrefix,
} from './storage.ts'
import { resetTestEnv, testEnv } from './test/harness.ts'

function delayFirstBudgetUpdate(db: D1Database, afterUpdate: () => Promise<void>): D1Database {
  let delayed = false
  const wrapStatement = (statement: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(statement, {
      get(inner, method) {
        if (method === 'bind') {
          return (...values: unknown[]) => wrapStatement(inner.bind(...values))
        }
        if (method === 'first') {
          return async () => {
            const result = await inner.first()
            if (!delayed) {
              delayed = true
              await afterUpdate()
            }
            return result
          }
        }
        const value = Reflect.get(inner, method, inner) as unknown
        return typeof value === 'function' ? value.bind(inner) : value
      },
    })
  return new Proxy(db, {
    get(target, property) {
      if (property === 'prepare') {
        return (query: string) => {
          const statement = target.prepare(query)
          return query.includes('UPDATE r2_storage_budget') ? wrapStatement(statement) : statement
        }
      }
      const value = Reflect.get(target, property, target) as unknown
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

const octoberEnd = Date.UTC(2026, 9, 31, 23, 59, 59)
const novemberStart = Date.UTC(2026, 10, 1, 0, 0, 1)

function crossingMonthClock(): () => number {
  let reads = 0
  return () => (reads++ === 0 ? octoberEnd : novemberStart)
}

describe('storage keys', () => {
  it('namespaces every object under the owning user', () => {
    expect(userFilePrefix('user-1')).toBe('users/user-1/')
    expect(activityFileKey('user-1', 'act-9')).toBe('users/user-1/act-9')
  })
})

describe('deleteByPrefix', () => {
  it('deletes across pages and leaves other prefixes alone', async () => {
    await resetTestEnv()
    const bucket = testEnv().FILES
    for (let i = 0; i < 5; i += 1) {
      await bucket.put(`users/a/${i}`, 'x')
    }
    await bucket.put('users/ab/0', 'keep')
    await bucket.put('users/b/0', 'keep')

    const deleted = await deleteByPrefix(bucket, 'users/a/', 2)

    expect(deleted).toBe(5)
    expect(await bucket.list({ prefix: 'users/a/' })).toMatchObject({ objects: [] })
    const remaining = (await bucket.list()).objects.map((o) => o.key).sort()
    expect(remaining).toEqual(['users/ab/0', 'users/b/0'])
  })

  it('returns zero when nothing matches', async () => {
    await resetTestEnv()
    expect(await deleteByPrefix(testEnv().FILES, 'nothing/')).toBe(0)
  })
})

describe('global R2 budgets', () => {
  it('counts failed PUT attempts against monthly operations and monthly bytes', async () => {
    await resetTestEnv()
    const env = testEnv()
    const bucket = new Proxy(env.FILES, {
      get(target, property) {
        if (property === 'put')
          return async () => {
            throw new Error('simulated R2 failure')
          }
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    await expect(
      putOriginalFile(env.DB, bucket, 'attempted', new Uint8Array([1, 2, 3]), {}, () =>
        Date.UTC(2026, 9, 1),
      ),
    ).rejects.toThrow('simulated R2 failure')
    expect(
      await env.DB.prepare(
        'SELECT lifetime_put_bytes, monthly_put_bytes, monthly_operations FROM r2_storage_budget WHERE id = 1',
      ).first(),
    ).toEqual({
      lifetime_put_bytes: MIN_GLOBAL_R2_PUT_CHARGE_BYTES,
      monthly_put_bytes: MIN_GLOBAL_R2_PUT_CHARGE_BYTES,
      monthly_operations: 1,
    })
  })

  it('rejects a write past the monthly byte cap before calling R2', async () => {
    await resetTestEnv()
    const env = testEnv()
    const now = Date.UTC(2026, 9, 1)
    await reserveR2Operation(env.DB, now)
    await env.DB.prepare('UPDATE r2_storage_budget SET monthly_put_bytes = ? WHERE id = 1')
      .bind(MAX_MONTHLY_R2_PUT_BYTES - 1)
      .run()
    let putCalls = 0
    const bucket = new Proxy(env.FILES, {
      get(target, property) {
        if (property === 'put')
          return async () => {
            putCalls += 1
          }
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    await expect(
      putOriginalFile(env.DB, bucket, 'too-large', new Uint8Array([1, 2]), {}, () => now),
    ).rejects.toMatchObject({ status: 429, code: 'storage_budget_exhausted' })
    expect(putCalls).toBe(0)
    expect(await getOriginalFile(env.DB, env.FILES, 'still-readable', () => now)).toBeNull()
    expect(
      await env.DB.prepare(
        'SELECT monthly_put_bytes, monthly_operations FROM r2_storage_budget WHERE id = 1',
      ).first(),
    ).toEqual({ monthly_put_bytes: MAX_MONTHLY_R2_PUT_BYTES - 1, monthly_operations: 2 })
  })

  it('atomically admits only one concurrent PUT at the remaining monthly-budget edge', async () => {
    await resetTestEnv()
    const env = testEnv()
    const now = Date.UTC(2026, 9, 1)
    await reserveR2Operation(env.DB, now)
    await env.DB.prepare('UPDATE r2_storage_budget SET monthly_put_bytes = ? WHERE id = 1')
      .bind(MAX_MONTHLY_R2_PUT_BYTES - MIN_GLOBAL_R2_PUT_CHARGE_BYTES)
      .run()
    let putCalls = 0
    const bucket = new Proxy(env.FILES, {
      get(target, property) {
        if (property === 'put')
          return async () => {
            putCalls += 1
          }
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const body = new Uint8Array([1])

    const results = await Promise.allSettled([
      putOriginalFile(env.DB, bucket, 'edge-a', body, {}, () => now),
      putOriginalFile(env.DB, bucket, 'edge-b', body, {}, () => now),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(putCalls).toBe(1)
    expect(
      await env.DB.prepare(
        'SELECT monthly_put_bytes, monthly_operations FROM r2_storage_budget WHERE id = 1',
      ).first(),
    ).toEqual({
      monthly_put_bytes: MAX_MONTHLY_R2_PUT_BYTES,
      monthly_operations: 2,
    })
  })

  it('resumes PUTs in a new UTC month after the monthly byte budget was spent', async () => {
    await resetTestEnv()
    const env = testEnv()
    await reserveR2Operation(env.DB, Date.UTC(2026, 0, 15))
    await env.DB.prepare(
      'UPDATE r2_storage_budget SET monthly_period = ?, monthly_put_bytes = ? WHERE id = 1',
    )
      .bind('2026-01', MAX_MONTHLY_R2_PUT_BYTES)
      .run()
    await expect(
      putOriginalFile(env.DB, env.FILES, 'jan', new Uint8Array([1]), {}, () =>
        Date.UTC(2026, 0, 15),
      ),
    ).rejects.toMatchObject({ code: 'storage_budget_exhausted' })

    await putOriginalFile(env.DB, env.FILES, 'feb', new Uint8Array([1]), {}, () =>
      Date.UTC(2026, 1, 1, 0, 0, 1),
    )
    expect(await env.FILES.get('feb')).not.toBeNull()
    expect(
      await env.DB.prepare(
        'SELECT monthly_period, monthly_put_bytes FROM r2_storage_budget WHERE id = 1',
      ).first(),
    ).toEqual({ monthly_period: '2026-02', monthly_put_bytes: MIN_GLOBAL_R2_PUT_CHARGE_BYTES })
  })

  it('blocks standard operations at 90,000 but reserves cleanup headroom up to 100,000', async () => {
    await resetTestEnv()
    const env = testEnv()
    const now = Date.UTC(2026, 9, 1)
    await reserveR2Operation(env.DB, now)
    await env.DB.prepare(
      'UPDATE r2_storage_budget SET monthly_period = ?, monthly_operations = ? WHERE id = 1',
    )
      .bind('2026-10', MAX_GLOBAL_R2_STANDARD_OPERATIONS)
      .run()
    await expect(reserveR2Operation(env.DB, now)).rejects.toMatchObject({
      status: 429,
      code: 'storage_budget_exhausted',
    })

    const budget = await reserveR2CleanupBudget(env.DB, now)
    await deleteByPrefixWithBudget(env.FILES, 'empty/', budget)
    await releaseR2CleanupBudget(env.DB, budget)
    expect(
      await env.DB.prepare('SELECT monthly_operations FROM r2_storage_budget WHERE id = 1').first(),
    ).toEqual({ monthly_operations: MAX_GLOBAL_R2_STANDARD_OPERATIONS + 1 })
    expect(
      await getOriginalFile(env.DB, env.FILES, 'missing', () => now).catch((error) => error),
    ).toMatchObject({
      status: 429,
      code: 'storage_budget_exhausted',
    })
  })

  it('counts a missing GET and failed cleanup LIST attempt, and frees unused reserved headroom', async () => {
    await resetTestEnv()
    const env = testEnv()
    const now = Date.UTC(2026, 9, 1)
    expect(await getOriginalFile(env.DB, env.FILES, 'missing', () => now)).toBeNull()
    const budget = await reserveR2CleanupBudget(env.DB, now)
    const broken = new Proxy(env.FILES, {
      get(target, property) {
        if (property === 'list')
          return async () => {
            throw new Error('simulated LIST failure')
          }
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    try {
      await expect(deleteByPrefixWithBudget(broken, 'prefix/', budget)).rejects.toThrow(
        'simulated LIST failure',
      )
    } finally {
      await releaseR2CleanupBudget(env.DB, budget)
    }
    expect(
      await env.DB.prepare('SELECT monthly_operations FROM r2_storage_budget WHERE id = 1').first(),
    ).toEqual({ monthly_operations: 2 })
    expect(MAX_GLOBAL_R2_MONTHLY_OPERATIONS).toBe(100_000)
  })

  it('resets monthly operations and monthly bytes on UTC month rollover, but keeps the lifetime audit total', async () => {
    await resetTestEnv()
    const env = testEnv()
    await reserveR2Operation(env.DB, Date.UTC(2026, 9, 1))
    await env.DB.prepare(
      `UPDATE r2_storage_budget SET lifetime_put_bytes = 1234, monthly_put_bytes = 999,
         monthly_period = ?, monthly_operations = ?`,
    )
      .bind('2026-09', MAX_GLOBAL_R2_MONTHLY_OPERATIONS)
      .run()
    await reserveR2Operation(env.DB, Date.UTC(2026, 9, 1))
    expect(
      await env.DB.prepare(
        'SELECT lifetime_put_bytes, monthly_put_bytes, monthly_period, monthly_operations FROM r2_storage_budget WHERE id = 1',
      ).first(),
    ).toEqual({
      lifetime_put_bytes: 1234,
      monthly_put_bytes: 0,
      monthly_period: '2026-10',
      monthly_operations: 1,
    })
  })

  it('charges a PUT in the month when R2 is called after a delayed D1 reservation', async () => {
    await resetTestEnv()
    const env = testEnv()
    const delayedDb = delayFirstBudgetUpdate(env.DB, async () => {
      await env.DB.prepare(
        `UPDATE r2_storage_budget SET monthly_period = ?, monthly_operations = 0,
           monthly_put_bytes = 0 WHERE id = 1`,
      )
        .bind('2026-11')
        .run()
    })
    const body = new Uint8Array([1, 2, 3, 4])

    await putOriginalFile(delayedDb, env.FILES, 'rollover-put', body, {}, crossingMonthClock())

    expect(
      await env.DB.prepare(
        'SELECT lifetime_put_bytes, monthly_put_bytes, monthly_period, monthly_operations FROM r2_storage_budget WHERE id = 1',
      ).first(),
    ).toEqual({
      lifetime_put_bytes: MIN_GLOBAL_R2_PUT_CHARGE_BYTES * 2,
      monthly_put_bytes: MIN_GLOBAL_R2_PUT_CHARGE_BYTES,
      monthly_period: '2026-11',
      monthly_operations: 1,
    })
    expect(await env.FILES.get('rollover-put')).not.toBeNull()
  })

  it('does not start a GET when the new month is at its standard-operation cap', async () => {
    await resetTestEnv()
    const env = testEnv()
    let getCalls = 0
    const bucket = new Proxy(env.FILES, {
      get(target, property) {
        if (property === 'get')
          return async () => {
            getCalls += 1
            return null
          }
        const value = Reflect.get(target, property, target) as unknown
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const delayedDb = delayFirstBudgetUpdate(env.DB, async () => {
      await env.DB.prepare(
        'UPDATE r2_storage_budget SET monthly_period = ?, monthly_operations = ? WHERE id = 1',
      )
        .bind('2026-11', MAX_GLOBAL_R2_STANDARD_OPERATIONS)
        .run()
    })

    await expect(
      getOriginalFile(delayedDb, bucket, 'rollover-get', crossingMonthClock()),
    ).rejects.toMatchObject({ status: 429, code: 'storage_budget_exhausted' })
    expect(getCalls).toBe(0)
    expect(
      await env.DB.prepare(
        'SELECT monthly_period, monthly_operations FROM r2_storage_budget WHERE id = 1',
      ).first(),
    ).toEqual({ monthly_period: '2026-11', monthly_operations: MAX_GLOBAL_R2_STANDARD_OPERATIONS })
  })
})
