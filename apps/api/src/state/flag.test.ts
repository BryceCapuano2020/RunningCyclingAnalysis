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
    expect(serverStateFor({ SERVER_COMPUTE_ACCOUNTS: '*', ENVIRONMENT: 'development' }, 'x')).toBe(
      true,
    )
  })

  it('ignores * in production, from the secret the deploy check cannot read as from the variable', () => {
    for (const env of [
      { SERVER_COMPUTE_ACCOUNTS: '*', ENVIRONMENT: 'production' },
      { SERVER_COMPUTE_USERS: '*', ENVIRONMENT: 'production' },
    ]) {
      expect(serverStateFor(env, 'anyone')).toBe(false)
      expect(serverStateAnyone(env)).toBe(false)
    }
    // A listed id beside it still counts.
    const mixed = { SERVER_COMPUTE_ACCOUNTS: '*, u1', ENVIRONMENT: 'production' }
    expect(serverStateFor(mixed, 'u1')).toBe(true)
    expect(serverStateFor(mixed, 'u2')).toBe(false)
  })

  it('reads the Worker secret when one is set, and the secret wins over the variable, even empty', () => {
    const both = { SERVER_COMPUTE_USERS: 'u1', SERVER_COMPUTE_ACCOUNTS: 'u2' }
    expect(serverStateFor(both, 'u2')).toBe(true)
    expect(serverStateFor(both, 'u1')).toBe(false)
    expect(serverStateFor({ SERVER_COMPUTE_ACCOUNTS: ' u9 ' }, 'u9')).toBe(true)
    // An empty secret switches everyone off whatever the variable says.
    expect(serverStateAnyone({ SERVER_COMPUTE_USERS: 'u1', SERVER_COMPUTE_ACCOUNTS: '' })).toBe(
      false,
    )
    expect(serverStateFor({ SERVER_COMPUTE_USERS: 'u1' }, 'u1')).toBe(true)
  })
})
