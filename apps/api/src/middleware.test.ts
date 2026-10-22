import { describe, expect, it } from 'vitest'
import type { Context } from 'hono'
import type { AppEnv } from './env.ts'
import { HttpError } from './errors.ts'
import { currentUser } from './middleware.ts'

describe('currentUser', () => {
  it('returns the user set by requireUser', () => {
    const user = { id: 'u1', email: 'a@b.co', name: 'A', pictureUrl: null }
    const c = { var: { user } } as unknown as Context<AppEnv>
    expect(currentUser(c)).toBe(user)
  })

  it('throws 401 when no user is set', () => {
    const c = { var: { user: null } } as unknown as Context<AppEnv>
    expect(() => currentUser(c)).toThrow(HttpError)
    expect(() => currentUser(c)).toThrow('Sign in required')
  })
})
