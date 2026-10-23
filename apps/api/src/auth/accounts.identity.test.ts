import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it } from 'vitest'
import { schema } from '../db/schema.ts'
import { systemDeps } from '../deps.ts'
import { testEnv } from '../test/harness.ts'
import { GOOGLE_PROVIDER, signInWithGoogle } from './accounts.ts'
import type { GoogleProfile } from './google.ts'

const LINK_STATEMENT = 'INSERT INTO oauth_accounts'

/**
 * Wraps a D1 binding so that every statement which links a Google identity waits for `beforeLink`
 * before it runs. Lets a test order two sign-in callbacks without relying on timing.
 */
function gateLinks(target: D1Database, beforeLink: () => Promise<void>): D1Database {
  const gateRun = (bound: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(bound, {
      get(obj, prop) {
        const value: unknown = Reflect.get(obj, prop, obj)
        if (prop === 'run' || prop === 'all' || prop === 'first' || prop === 'raw') {
          if (typeof value !== 'function') return value
          return async (...args: unknown[]) => {
            await beforeLink()
            return Reflect.apply(value, obj, args)
          }
        }
        return typeof value === 'function' ? value.bind(obj) : value
      },
    })
  return new Proxy(target, {
    get(obj, prop) {
      const value: unknown = Reflect.get(obj, prop, obj)
      if (prop !== 'prepare' || typeof value !== 'function') {
        return typeof value === 'function' ? value.bind(obj) : value
      }
      return (sql: string) => {
        const statement: D1PreparedStatement = Reflect.apply(value, obj, [sql])
        if (!sql.includes(LINK_STATEMENT)) return statement
        return new Proxy(statement, {
          get(stmt, method) {
            const member: unknown = Reflect.get(stmt, method, stmt)
            if (method !== 'bind' || typeof member !== 'function') {
              return typeof member === 'function' ? member.bind(stmt) : member
            }
            return (...params: unknown[]) => gateRun(Reflect.apply(member, stmt, params))
          },
        })
      }
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

describe('signInWithGoogle identity links', () => {
  it('never re-links a Google identity that is already linked to another user', async () => {
    const db = drizzle(testEnv().DB, { schema })
    const owner = await signInWithGoogle(
      db,
      systemDeps,
      profileFor('sub-owner', 'owner@example.com'),
    )
    await signInWithGoogle(db, systemDeps, profileFor('sub-other', 'other@example.com'))

    const again = await signInWithGoogle(
      db,
      systemDeps,
      profileFor('sub-owner', 'other@example.com'),
    )

    expect(again.id).toBe(owner.id)
    expect(await linkedUserIds('sub-owner')).toEqual([owner.id])
  })

  it('keeps an identity with the user that linked it first when two callbacks race', async () => {
    const env = testEnv()
    const firstProfile = profileFor('shared-sub', 'first@example.com')
    const secondProfile = profileFor('shared-sub', 'second@example.com')

    let secondAtLink!: () => void
    const secondReady = new Promise<void>((resolve) => (secondAtLink = resolve))
    let firstFinished!: () => void
    const firstDone = new Promise<void>((resolve) => (firstFinished = resolve))

    // Both callbacks finish their lookups before either links. The first to link wins; the second
    // must then resolve to that same user, not take the identity over.
    const firstRun = signInWithGoogle(
      drizzle(
        gateLinks(env.DB, () => secondReady),
        { schema },
      ),
      systemDeps,
      firstProfile,
    )
    void firstRun.finally(() => firstFinished()).catch(() => undefined)
    const secondRun = signInWithGoogle(
      drizzle(
        gateLinks(env.DB, async () => {
          secondAtLink()
          await firstDone
        }),
        { schema },
      ),
      systemDeps,
      secondProfile,
    )

    const [first, second] = await Promise.all([firstRun, secondRun])
    expect(second.id).toBe(first.id)
    expect(await linkedUserIds('shared-sub')).toEqual([first.id])
  })
})
