import { describe, expect, it } from 'vitest'
import { activityFileKey, deleteByPrefix, userFilePrefix } from './storage.ts'
import { resetTestEnv, testEnv } from './test/harness.ts'

describe('storage keys', () => {
  it('namespaces every object under the owning user', () => {
    expect(userFilePrefix('user-1')).toBe('users/user-1/')
    expect(activityFileKey('user-1', 'act-9')).toBe('users/user-1/act-9')
  })
})

describe('deleteByPrefix', () => {
  it('deletes across pages and leaves other prefixes alone', async () => {
    await resetTestEnv()
    const bucket = testEnv().FILES
    for (let i = 0; i < 5; i += 1) {
      await bucket.put(`users/a/${i}`, 'x')
    }
    await bucket.put('users/ab/0', 'keep')
    await bucket.put('users/b/0', 'keep')

    const deleted = await deleteByPrefix(bucket, 'users/a/', 2)

    expect(deleted).toBe(5)
    expect(await bucket.list({ prefix: 'users/a/' })).toMatchObject({ objects: [] })
    const remaining = (await bucket.list()).objects.map((o) => o.key).sort()
    expect(remaining).toEqual(['users/ab/0', 'users/b/0'])
  })

  it('returns zero when nothing matches', async () => {
    await resetTestEnv()
    expect(await deleteByPrefix(testEnv().FILES, 'nothing/')).toBe(0)
  })
})
