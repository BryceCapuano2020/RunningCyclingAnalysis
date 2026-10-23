import { describe, expect, it } from 'vitest'
import { createHarness, START, testEnv } from '../test/harness.ts'

const PROFILE = { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false }

/** A profile request body of exactly `bytes` bytes: the JSON padded with trailing spaces. */
function profileBody(bytes: number): Uint8Array {
  const text = JSON.stringify({ ...PROFILE, keepFiles: true }).padEnd(bytes, ' ')
  return new TextEncoder().encode(text)
}

/** Counts every R2 call made through the bucket, so a test can prove none happened. */
function countingBucket(target: R2Bucket): { bucket: R2Bucket; calls: string[] } {
  const calls: string[] = []
  const bucket = new Proxy(target, {
    get(obj, prop) {
      const value: unknown = Reflect.get(obj, prop, obj)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        calls.push(String(prop))
        return Reflect.apply(value, obj, args)
      }
    },
  })
  return { bucket, calls }
}

describe('PUT /api/profile file sweep', () => {
  it('turns files off without touching R2 when the account has no stored files', async () => {
    const { bucket, calls } = countingBucket(testEnv().FILES)
    const h = createHarness({}, { FILES: bucket })
    const token = await h.signIn()
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...PROFILE, keepFiles: true },
      cookies: { rca_session: token },
    })
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: PROFILE,
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
    expect(calls).toEqual([])
    const budget = await testEnv()
      .DB.prepare('SELECT COUNT(*) AS n FROM r2_storage_budget')
      .first<{ n: number }>()
    expect(budget?.n).toBe(0)
  })
})

describe('PUT /api/profile body limit', () => {
  it('accepts a body of exactly 4 KiB', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      headers: { 'content-type': 'application/json' },
      raw: profileBody(4 * 1024),
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
  })

  it('rejects a body one byte over 4 KiB with 413', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      headers: { 'content-type': 'application/json' },
      raw: profileBody(4 * 1024 + 1),
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: { code: 'payload_too_large' } })
  })
})

describe('PUT /api/profile age and sex', () => {
  it('writes year of birth and sex when they are sent', async () => {
    const h = createHarness()
    const token = await h.signIn()
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...PROFILE, birthYear: 1975, sex: 'male' },
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ birthYear: 1975, sex: 'male' })
    const me = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(await me.json()).toMatchObject({ profile: { birthYear: 1975, sex: 'male' } })
  })

  it('keeps saved year of birth and sex when a save leaves them out', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...PROFILE, birthYear: 1990, sex: 'female' },
      cookies: { rca_session: token },
    })
    h.clock.now += 1_000
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...PROFILE, massKg: 81 },
      cookies: { rca_session: token },
    })
    expect(await res.json()).toEqual({
      ...PROFILE,
      massKg: 81,
      birthYear: 1990,
      sex: 'female',
      updatedAt: START + 1_000,
    })
    const me = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(await me.json()).toMatchObject({
      profile: { massKg: 81, birthYear: 1990, sex: 'female' },
    })
  })

  it('clears saved year of birth and sex when they are sent as null', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...PROFILE, birthYear: 1990, sex: 'female' },
      cookies: { rca_session: token },
    })
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...PROFILE, birthYear: null, sex: null },
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ birthYear: null, sex: null })
    const me = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(await me.json()).toMatchObject({ profile: { birthYear: null, sex: null } })
  })

  it('keeps the year of birth when a save sends only sex, and the sex when it sends only the year', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...PROFILE, birthYear: 1990, sex: 'female' },
      cookies: { rca_session: token },
    })

    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...PROFILE, sex: 'male' },
      cookies: { rca_session: token },
    })
    const afterSex = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(await afterSex.json()).toMatchObject({ profile: { birthYear: 1990, sex: 'male' } })

    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...PROFILE, birthYear: 1985 },
      cookies: { rca_session: token },
    })
    const afterYear = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(await afterYear.json()).toMatchObject({ profile: { birthYear: 1985, sex: 'male' } })
  })

  it('leaves the saved profile unchanged when a save is refused for an invalid year or sex', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...PROFILE, birthYear: 1990, sex: 'female' },
      cookies: { rca_session: token },
    })

    for (const rejected of [
      { ...PROFILE, massKg: 90, birthYear: 1800 },
      { ...PROFILE, massKg: 90, sex: 'other' },
    ]) {
      const res = await h.send({
        method: 'PUT',
        path: '/api/profile',
        json: rejected,
        cookies: { rca_session: token },
      })
      expect(res.status).toBe(400)
    }

    const me = await h.send({ path: '/api/me', cookies: { rca_session: token } })
    expect(await me.json()).toMatchObject({
      profile: { ...PROFILE, birthYear: 1990, sex: 'female' },
    })
  })

  it('inserts a new profile with the year of birth and sex it was sent', async () => {
    const h = createHarness()
    const token = await h.signIn()
    await h.env.DB.prepare('DELETE FROM profiles').run()
    const res = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { ...PROFILE, birthYear: 2001, sex: 'male' },
      cookies: { rca_session: token },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ birthYear: 2001, sex: 'male' })
  })
})
