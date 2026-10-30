import { DATABASE_SOFT_LIMIT_BYTES } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import {
  MAX_DATABASE_LIMIT_MIB,
  MIN_DATABASE_LIMIT_MIB,
  databaseSoftLimitBytes,
} from './databaseGuard.ts'
import { createHarness, digestFixture } from './test/harness.ts'

const MIB = 1024 * 1024

describe('databaseSoftLimitBytes', () => {
  it('keeps the Workers Free cap unless a valid whole number of MiB is set', () => {
    expect(databaseSoftLimitBytes({})).toBe(DATABASE_SOFT_LIMIT_BYTES)
    for (const bad of ['', ' ', 'abc', '1e3', '-5', '512.5', '0', '63', '9217', '1000000']) {
      expect(databaseSoftLimitBytes({ DATABASE_SOFT_LIMIT_MIB: bad })).toBe(
        DATABASE_SOFT_LIMIT_BYTES,
      )
    }
  })

  it('reads an unquoted wrangler var, which arrives as a number, without throwing', () => {
    const numeric = { DATABASE_SOFT_LIMIT_MIB: 9000 } as unknown as {
      DATABASE_SOFT_LIMIT_MIB: string
    }
    expect(databaseSoftLimitBytes(numeric)).toBe(9000 * MIB)
    const tooBig = { DATABASE_SOFT_LIMIT_MIB: 99999 } as unknown as {
      DATABASE_SOFT_LIMIT_MIB: string
    }
    expect(databaseSoftLimitBytes(tooBig)).toBe(DATABASE_SOFT_LIMIT_BYTES)
  })

  it('takes a value in range, whitespace aside', () => {
    expect(databaseSoftLimitBytes({ DATABASE_SOFT_LIMIT_MIB: ' 4096 ' })).toBe(4096 * MIB)
    expect(
      databaseSoftLimitBytes({ DATABASE_SOFT_LIMIT_MIB: String(MIN_DATABASE_LIMIT_MIB) }),
    ).toBe(MIN_DATABASE_LIMIT_MIB * MIB)
    expect(
      databaseSoftLimitBytes({ DATABASE_SOFT_LIMIT_MIB: String(MAX_DATABASE_LIMIT_MIB) }),
    ).toBe(MAX_DATABASE_LIMIT_MIB * MIB)
  })
})

describe('database size guard with a configured limit', () => {
  async function createAt(overrides: Record<string, unknown>, lastSeenBytes: number) {
    const h = createHarness({}, overrides)
    const token = await h.signIn()
    await h.env.DB.prepare(
      `INSERT INTO r2_storage_budget (id, lifetime_put_bytes, monthly_period, monthly_operations,
         monthly_put_bytes, d1_size_bytes) VALUES (1, 0, '2026-01', 0, 0, ?)
         ON CONFLICT(id) DO UPDATE SET d1_size_bytes = excluded.d1_size_bytes`,
    )
      .bind(lastSeenBytes)
      .run()
    return h.send({
      method: 'POST',
      path: '/api/activities',
      json: { digest: digestFixture(), fileName: 'a.fit', fileHash: 'a'.repeat(64) },
      cookies: { rca_session: token },
    })
  }

  it('refuses above 450 MiB by default and admits the same size when the plan limit is raised', async () => {
    const size = 600 * MIB
    expect((await createAt({}, size)).status).toBe(503)
    expect((await createAt({ DATABASE_SOFT_LIMIT_MIB: '2048' }, size)).status).toBe(201)
  })

  it('still refuses above a raised limit', async () => {
    expect((await createAt({ DATABASE_SOFT_LIMIT_MIB: '2048' }, 2049 * MIB)).status).toBe(503)
  })
})
