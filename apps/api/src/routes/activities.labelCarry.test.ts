import { MODEL_REVISION } from '@rca/core/digest/modelRevision'
import { describe, expect, it } from 'vitest'
import { START, createHarness, digestFixture, type Harness } from '../test/harness.ts'
import { seedActivityRow } from '../test/seed.ts'
import { keepStoredLabel } from './activities/storedLabel.ts'

const HASH = 'd'.repeat(64)
const STALE = MODEL_REVISION - 1

function as(token: string) {
  return { cookies: { rca_session: token } }
}

async function account(h: Harness) {
  const token = await h.signIn('rider@example.com')
  const me = (await (await h.send({ path: '/api/me', ...as(token) })).json()) as {
    user: { id: string }
  }
  return { token, userId: me.user.id }
}

/** The rebuild: the current digest of the same workout and file, with whatever fields the file gives. */
function rebuild(h: Harness, token: string, over: Record<string, unknown> = {}) {
  return h.send({
    method: 'POST',
    path: '/api/activities',
    json: {
      digest: digestFixture({ id: 'source-1', startMs: START, ...over }),
      fileName: 'ride.fit',
      fileHash: HASH,
    },
    ...as(token),
  })
}

async function stored(h: Harness, id: string) {
  const row = await h.env.DB.prepare('SELECT digest_json FROM activities WHERE id = ?')
    .bind(id)
    .first<{ digest_json: string }>()
  return JSON.parse(row!.digest_json) as Record<string, unknown>
}

async function bytes(h: Harness, userId: string) {
  const counter = await h.env.DB.prepare('SELECT digest_bytes AS n FROM users WHERE id = ?')
    .bind(userId)
    .first<{ n: number }>()
  const actual = await h.env.DB.prepare(
    'SELECT coalesce(sum(length(CAST(digest_json AS BLOB))), 0) AS n FROM activities WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ n: number }>()
  return { counter: counter!.n, actual: actual!.n }
}

describe('keepStoredLabel', () => {
  const stored = JSON.stringify({ id: 'x', athleteType: 'hike' })
  const incoming = JSON.stringify({ id: 'x', modelRevision: 6 })

  it('puts the stored label on a digest that has none', () => {
    expect(JSON.parse(keepStoredLabel(stored, {}, incoming))).toEqual({
      id: 'x',
      modelRevision: 6,
      athleteType: 'hike',
    })
  })

  it('leaves a digest with its own label alone, and one when nothing is stored', () => {
    const own = JSON.stringify({ id: 'x', athleteType: 'ski' })
    expect(keepStoredLabel(stored, { athleteType: 'ski' }, own)).toBe(own)
    expect(keepStoredLabel(JSON.stringify({ id: 'x' }), {}, incoming)).toBe(incoming)
  })

  it('does not carry a value that is not a label, or text that is not JSON', () => {
    expect(keepStoredLabel(JSON.stringify({ athleteType: 'cat' }), {}, incoming)).toBe(incoming)
    expect(keepStoredLabel(JSON.stringify({ athleteType: null }), {}, incoming)).toBe(incoming)
    expect(keepStoredLabel('not json', {}, incoming)).toBe(incoming)
  })
})

describe('a rebuild of a labelled activity', () => {
  it('keeps the label the athlete set, and moves the revision and the counter together', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const id = await seedActivityRow(h.env.DB, {
      userId,
      revision: STALE,
      fileHash: HASH,
      digest: { id: 'source-1', startMs: START, athleteType: 'hike' },
    })
    const res = await rebuild(h, token)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id,
      digest: { modelRevision: MODEL_REVISION, athleteType: 'hike' },
    })
    expect(await stored(h, id)).toMatchObject({
      modelRevision: MODEL_REVISION,
      athleteType: 'hike',
    })
    const sizes = await bytes(h, userId)
    expect(sizes.counter).toBe(sizes.actual)
  })

  it('keeps a label set after the updater listed the library but before it saved', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const id = await seedActivityRow(h.env.DB, {
      userId,
      revision: STALE,
      fileHash: HASH,
      digest: { id: 'source-1', startMs: START },
    })
    // The athlete labels the row as the client read it (stale), then the rebuild, made from the unlabelled
    // record the updater listed, arrives.
    const labelled = await h.send({
      method: 'PATCH',
      path: '/api/activities/labels',
      json: { labels: [{ id, revision: STALE, from: null, athleteType: 'walk' }] },
      ...as(token),
    })
    expect(await labelled.json()).toMatchObject({ applied: 1 })
    const res = await rebuild(h, token)
    expect(await res.json()).toMatchObject({
      digest: { modelRevision: MODEL_REVISION, athleteType: 'walk' },
    })
    expect((await stored(h, id)).athleteType).toBe('walk')
    const sizes = await bytes(h, userId)
    expect(sizes.counter).toBe(sizes.actual)
  })

  it('adds no label to an activity that had none, and lets a digest with its own label win', async () => {
    const h = createHarness()
    const { token, userId } = await account(h)
    const plain = await seedActivityRow(h.env.DB, {
      userId,
      revision: STALE,
      fileHash: HASH,
      digest: { id: 'source-1', startMs: START },
    })
    await rebuild(h, token)
    expect(await stored(h, plain)).not.toHaveProperty('athleteType')

    const other = await seedActivityRow(h.env.DB, {
      userId,
      revision: STALE,
      fileHash: HASH,
      digest: { id: 'source-2', startMs: START + 3_600_000, athleteType: 'hike' },
    })
    await rebuild(h, token, { id: 'source-2', startMs: START + 3_600_000, athleteType: 'ski' })
    expect((await stored(h, other)).athleteType).toBe('ski')
  })
})
