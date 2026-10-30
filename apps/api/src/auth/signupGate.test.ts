import { describe, expect, it } from 'vitest'
import type { Bindings } from '../env.ts'
import { identityKeyFor, parseAllowedEmails, signupGate } from './signupGate.ts'

const env = (overrides: Partial<Bindings>): Bindings =>
  ({
    ENVIRONMENT: 'production',
    APP_URL: 'https://app.example.test',
    SESSION_SIGNING_KEY: 'a-signing-key-of-at-least-thirty-two-bytes',
    ...overrides,
  }) as Bindings

describe('parseAllowedEmails', () => {
  it('trims, lower-cases, and drops blanks and entries that are not addresses', () => {
    expect([
      ...parseAllowedEmails(' A@Example.test ,b@example.test,,  , not-an-address, C@EXAMPLE.TEST '),
    ]).toEqual(['a@example.test', 'b@example.test', 'c@example.test'])
  })

  it.each([undefined, '', '   ', ',,,', 'no at sign'])('is empty for %j', (raw) => {
    expect(parseAllowedEmails(raw).size).toBe(0)
  })
})

describe('signupGate', () => {
  const url = 'https://app.example.test/api/auth/google/callback'

  it('allows exactly the listed addresses, whatever their case', () => {
    const gate = signupGate(env({ ALLOWED_EMAILS: 'a@example.test, B@example.test' }), url)
    expect(gate.allows('a@example.test')).toBe(true)
    expect(gate.allows('A@EXAMPLE.TEST')).toBe(true)
    expect(gate.allows('b@example.test')).toBe(true)
    expect(gate.allows('c@example.test')).toBe(false)
    expect(gate.allows('a@example.test.evil.test')).toBe(false)
    expect(gate.allows('xa@example.test')).toBe(false)
  })

  it('has no wildcards: a star admits nobody', () => {
    const gate = signupGate(env({ ALLOWED_EMAILS: '*, *@example.test, @example.test' }), url)
    expect(gate.allows('a@example.test')).toBe(false)
  })

  it('fails closed with no list outside local development', () => {
    for (const ALLOWED_EMAILS of [undefined, '', ' , ']) {
      expect(signupGate(env({ ALLOWED_EMAILS }), url).allows('a@example.test')).toBe(false)
    }
  })

  it('is open with no list only on this machine in development', () => {
    const dev = env({ ENVIRONMENT: 'development', APP_URL: 'http://localhost:5183' })
    expect(signupGate(dev, 'http://localhost:8787/x').allows('anyone@example.test')).toBe(true)
    expect(signupGate(dev, 'https://app.example.test/x').allows('anyone@example.test')).toBe(false)
    expect(
      signupGate(env({ ENVIRONMENT: 'development' }), 'http://localhost/x').allows(
        'a@example.test',
      ),
    ).toBe(false)
  })

  it('still enforces a list in local development', () => {
    const gate = signupGate(
      env({
        ENVIRONMENT: 'development',
        APP_URL: 'http://localhost:5183',
        ALLOWED_EMAILS: 'a@example.test',
      }),
      'http://localhost/x',
    )
    expect(gate.allows('a@example.test')).toBe(true)
    expect(gate.allows('b@example.test')).toBe(false)
  })
})

describe('identityKeyFor', () => {
  const key = 'a-signing-key-of-at-least-thirty-two-bytes'

  it('is a stable 64-hex code that differs by subject and by key, and is not the subject', async () => {
    const a = await identityKeyFor(key, 'sub-1')
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await identityKeyFor(key, 'sub-1')).toBe(a)
    expect(await identityKeyFor(key, 'sub-2')).not.toBe(a)
    expect(await identityKeyFor(`${key}-rotated`, 'sub-1')).not.toBe(a)
    expect(a).not.toContain('sub-1')
  })

  it('is undefined without a usable key, never a code from a weak one', async () => {
    expect(await identityKeyFor(undefined, 'sub-1')).toBeUndefined()
    expect(await identityKeyFor('short', 'sub-1')).toBeUndefined()
  })
})
