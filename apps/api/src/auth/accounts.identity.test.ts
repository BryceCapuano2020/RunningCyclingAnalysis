import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it } from 'vitest'
import { schema } from '../db/schema.ts'
import { systemDeps } from '../deps.ts'
import { testEnv } from '../test/harness.ts'
import { GOOGLE_PROVIDER } from './accounts.ts'
import type { GoogleProfile } from './google.ts'
import { signInWithGoogle } from './signIn.ts'
import { signupGate } from './signupGate.ts'

/** Development on this machine, with no list: every verified address may create an account. */
const openGate = () => signupGate(testEnv(), 'http://localhost/')

/**
 * Wraps a D1 binding so that each call to `batch` waits at `beforeBatch` first. Lets a test hold
 * two sign-in callbacks after they have read and before either writes, without relying on timing.
 */
function gateBatches(target: D1Database, beforeBatch: () => Promise<void>): D1Database {
  return new Proxy(target, {
    get(obj, prop) {
      const value: unknown = Reflect.get(obj, prop, obj)
      if (prop === 'batch' && typeof value === 'function') {
        return async (...args: unknown[]) => {
          await beforeBatch()
          return Reflect.apply(value, obj, args)
        }
      }
      return typeof value === 'function' ? value.bind(obj) : value
    },
  })
}

function profileFor(sub: string, email: string): GoogleProfile {
  return { sub, email, name: 'Rider', pictureUrl: null }
}

async function linkedUserIds(sub: string): Promise<string[]> {
  const { results } = await testEnv()
    .DB.prepare(
      'SELECT user_id FROM oauth_accounts WHERE provider = ? AND provider_user_id = ? ORDER BY user_id',
    )
    .bind(GOOGLE_PROVIDER, sub)
    .all<{ user_id: string }>()
  return results.map((row) => row.user_id)
}

async function userCount(): Promise<number> {
  const row = await testEnv().DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>()
  return row?.n ?? 0
}

describe('signInWithGoogle identity links', () => {
  it('never re-links a Google identity that is already linked to another user', async () => {
    const db = drizzle(testEnv().DB, { schema })
    const owner = await signInWithGoogle(
      db,
      systemDeps,
      profileFor('sub-owner', 'owner@example.test'),
      openGate(),
    )
    await signInWithGoogle(
      db,
      systemDeps,
      profileFor('sub-other', 'other@example.test'),
      openGate(),
    )

    const again = await signInWithGoogle(
      db,
      systemDeps,
      profileFor('sub-owner', 'other@example.test'),
      openGate(),
    )

    expect(again.id).toBe(owner.id)
    expect(await linkedUserIds('sub-owner')).toEqual([owner.id])
  })

  it('keeps an identity with the user that linked it first when two callbacks race, and leaves no orphan user', async () => {
    const env = testEnv()
    // Both callbacks read before either writes: the same subject, two different addresses.
    let arrivals = 0
    let release!: () => void
    const bothArrived = new Promise<void>((resolve) => (release = resolve))
    const barrier = async () => {
      arrivals += 1
      if (arrivals === 2) release()
      await bothArrived
    }
    const run = (email: string) =>
      signInWithGoogle(
        drizzle(gateBatches(env.DB, barrier), { schema }),
        systemDeps,
        profileFor('shared-sub', email),
        openGate(),
      )

    const [first, second] = await Promise.all([
      run('first@example.test'),
      run('second@example.test'),
    ])

    expect(second.id).toBe(first.id)
    expect(await linkedUserIds('shared-sub')).toEqual([first.id])
    // The loser's batch rolled back whole, so its user row was never created.
    expect(await userCount()).toBe(1)
  })

  it('creates the user and its link together or not at all', async () => {
    const env = testEnv()
    // A link for the subject appears between the reads and the batch, as a concurrent callback's would.
    const db = drizzle(
      gateBatches(env.DB, async () => {
        await env.DB.batch([
          env.DB.prepare(
            'INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)',
          ).bind('winner', 'winner@example.test', 'Winner', 1),
          env.DB.prepare(
            'INSERT INTO oauth_accounts (provider, provider_user_id, user_id) VALUES (?, ?, ?)',
          ).bind(GOOGLE_PROVIDER, 'sub-contested', 'winner'),
        ])
      }),
      { schema },
    )

    const signedIn = await signInWithGoogle(
      db,
      systemDeps,
      profileFor('sub-contested', 'loser@example.test'),
      openGate(),
    )

    expect(signedIn.id).toBe('winner')
    expect(await userCount()).toBe(1)
  })
})
