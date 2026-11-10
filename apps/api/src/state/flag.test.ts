import { describe, expect, it } from 'vitest'
import { serverStateAnyone, serverStateFor } from './flag.ts'

describe('the server compute allowlist', () => {
  it('is off for everyone when unset, empty or only separators', () => {
    for (const list of [undefined, '', ' ', ',', ' , ,']) {
      expect(serverStateAnyone({ SERVER_COMPUTE_USERS: list })).toBe(false)
      expect(serverStateFor({ SERVER_COMPUTE_USERS: list }, 'u1')).toBe(false)
    }
  })

  it('is on for the listed ids only, whatever the spacing', () => {
    const env = { SERVER_COMPUTE_USERS: ' u1,u2 , u3' }
    expect(serverStateAnyone(env)).toBe(true)
    expect(['u1', 'u2', 'u3'].map((id) => serverStateFor(env, id))).toEqual([true, true, true])
    expect(serverStateFor(env, 'u4')).toBe(false)
    expect(serverStateFor(env, 'u')).toBe(false)
  })

  it('is on for everyone with *, which production configuration may not hold', () => {
    expect(serverStateFor({ SERVER_COMPUTE_USERS: '*' }, 'anyone')).toBe(true)
  })
})
