import { describe, expect, it } from 'vitest'
import {
  MAX_DIGEST_FLAG_MESSAGE_BYTES,
  MAX_DIGEST_ID_BYTES,
  MAX_DIGEST_NAME_BYTES,
  MAX_DIGEST_SESSION_KEY_BYTES,
} from '@rca/contract'
import { createHarness, digestFixture } from '../test/harness.ts'

const create = (digest: Record<string, unknown>) => ({
  method: 'POST' as const,
  path: '/api/activities',
  json: { digest, fileName: 'ride.fit', fileHash: 'a'.repeat(64) },
})

async function post(digest: Record<string, unknown>) {
  const h = createHarness()
  const token = await h.signIn()
  const res = await h.send({ ...create(digest), cookies: { rca_session: token } })
  return { res, h }
}

describe('the free text of a digest', () => {
  it('is kept when it is as long as the cap, counted in bytes', async () => {
    const { res } = await post(
      digestFixture({
        name: 'n'.repeat(MAX_DIGEST_NAME_BYTES),
        id: 'i'.repeat(MAX_DIGEST_ID_BYTES),
        sessionKey: 's'.repeat(MAX_DIGEST_SESSION_KEY_BYTES),
      }),
    )
    expect(res.status).toBe(201)
  })

  it.each([
    ['name', { name: 'n'.repeat(MAX_DIGEST_NAME_BYTES + 1) }],
    // 400 characters of 3 bytes each is 1,200 bytes: a character count would let it through.
    ['name in multi-byte characters', { name: '€'.repeat(400) }],
    ['id', { id: 'i'.repeat(MAX_DIGEST_ID_BYTES + 1) }],
    ['session key', { sessionKey: 's'.repeat(MAX_DIGEST_SESSION_KEY_BYTES + 1) }],
    [
      'flag message',
      {
        flags: [
          {
            kind: 'power-spike',
            start: 0,
            end: 10,
            message: 'm'.repeat(MAX_DIGEST_FLAG_MESSAGE_BYTES + 1),
          },
        ],
      },
    ],
  ])('refuses a %s over the cap with 413 text_too_long and stores nothing', async (_, over) => {
    const { res, h } = await post(digestFixture(over))
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ error: { code: 'text_too_long' } })
    const rows = await h.env.DB.prepare('SELECT COUNT(*) AS n FROM activities').first<{
      n: number
    }>()
    expect(rows?.n).toBe(0)
  })
})
