import { describe, expect, it } from 'vitest'
import { SessionListSchema, SessionRevokeSchema } from './sessions.ts'

describe('session schemas', () => {
  it('accepts a list of sessions with dates and the current flag, in any order', () => {
    const list = {
      sessions: [
        { createdAt: 2, expiresAt: 9, current: true },
        { createdAt: 1, expiresAt: 8, current: false },
      ],
    }
    expect(SessionListSchema.parse(list)).toEqual(list)
    expect(SessionListSchema.parse({ sessions: [] })).toEqual({ sessions: [] })
  })

  it.each([
    { sessions: [{ createdAt: 1, expiresAt: 2 }] },
    { sessions: [{ createdAt: 1.5, expiresAt: 2, current: true }] },
    { sessions: [{ createdAt: '1', expiresAt: 2, current: true }] },
    {},
  ])('rejects a list that is not well formed: %j', (value) => {
    expect(SessionListSchema.safeParse(value).success).toBe(false)
  })

  it('accepts a revoke count of zero or more and nothing else', () => {
    expect(SessionRevokeSchema.parse({ revoked: 0 })).toEqual({ revoked: 0 })
    expect(SessionRevokeSchema.parse({ revoked: 3 })).toEqual({ revoked: 3 })
    expect(SessionRevokeSchema.safeParse({ revoked: -1 }).success).toBe(false)
    expect(SessionRevokeSchema.safeParse({ revoked: 1.5 }).success).toBe(false)
    expect(SessionRevokeSchema.safeParse({}).success).toBe(false)
  })
})
