import { MAX_ACCOUNT_CREATES_PER_DAY } from '@rca/contract'
import { describe, expect, it } from 'vitest'
import { utcDay } from './budget.ts'
import { pruneIdentityBudget, takeAccountCreate } from './identityBudget.ts'
import { START, testEnv } from './test/harness.ts'

const KEY = 'a'.repeat(64)
const DAY_MS = 24 * 60 * 60 * 1000

describe('takeAccountCreate', () => {
  it('admits the cap and then refuses with 429 signup_limit and a retry time', async () => {
    const db = testEnv().DB
    for (let i = 0; i < MAX_ACCOUNT_CREATES_PER_DAY; i += 1) await takeAccountCreate(db, KEY, START)
    await expect(takeAccountCreate(db, KEY, START)).rejects.toMatchObject({
      status: 429,
      code: 'signup_limit',
      retryAfter: expect.any(Number),
    })
    // Another identity and the next day are separate counts.
    await takeAccountCreate(db, 'b'.repeat(64), START)
    await takeAccountCreate(db, KEY, START + DAY_MS)
  })

  it('does not admit more than the cap when taken at the same moment', async () => {
    const db = testEnv().DB
    const results = await Promise.allSettled(
      Array.from({ length: MAX_ACCOUNT_CREATES_PER_DAY + 4 }, () =>
        takeAccountCreate(db, KEY, START),
      ),
    )
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(
      MAX_ACCOUNT_CREATES_PER_DAY,
    )
  })

  it('gives a unit back on refund, and never goes below zero', async () => {
    const db = testEnv().DB
    const charge = await takeAccountCreate(db, KEY, START)
    await charge.refund()
    await charge.refund()
    const row = await db
      .prepare(
        "SELECT used FROM identity_budget WHERE identity_key = ? AND action = 'accountCreate'",
      )
      .bind(KEY)
      .first<{ used: number }>()
    expect(row?.used).toBe(0)
  })
})

describe('pruneIdentityBudget', () => {
  it('removes counts from before yesterday and keeps yesterday and today', async () => {
    const db = testEnv().DB
    const insert = db.prepare(
      "INSERT INTO identity_budget (identity_key, day, action, used) VALUES (?, ?, 'x', 1)",
    )
    await db.batch(
      [START - 3 * DAY_MS, START - 2 * DAY_MS, START - DAY_MS, START].map((t) =>
        insert.bind(KEY, utcDay(t)),
      ),
    )
    expect(await pruneIdentityBudget(db, START)).toBe(2)
    const days = await db
      .prepare('SELECT day FROM identity_budget ORDER BY day')
      .all<{ day: string }>()
    expect(days.results.map((r) => r.day)).toEqual([utcDay(START - DAY_MS), utcDay(START)])
  })

  it('stops at its limit, so one run is bounded', async () => {
    const db = testEnv().DB
    const insert = db.prepare(
      "INSERT INTO identity_budget (identity_key, day, action, used) VALUES (?, '2000-01-01', ?, 1)",
    )
    await db.batch(Array.from({ length: 10 }, (_, i) => insert.bind(KEY, `a${i}`)))
    expect(await pruneIdentityBudget(db, START, 4)).toBe(4)
  })
})
