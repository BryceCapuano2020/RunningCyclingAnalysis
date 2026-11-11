import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { runMaintenance } from '../maintenance.ts'
import { activityFileKey } from '../storage.ts'
import { createHarness, START, type Harness } from '../test/harness.ts'
import { addActivity, AFTER_GRACE, at, countOf, signedInUser } from '../test/maintenance.ts'
import { FAILED_INBOX_RETENTION_DAYS, SETTLED_INBOX_RETENTION_DAYS } from './expiry.ts'
import { inboxKey } from './key.ts'

const DAY = 24 * 60 * 60 * 1000

interface ItemSpec {
  id: string
  state: 'pending' | 'done' | 'failed'
  receivedAt?: number
  /** Puts the item's file in R2 and names it on the row. */
  withFile?: boolean
}

/** An inbox row as the push handler (G4) will write it, with its file when it has one. */
async function seedItem(h: Harness, userId: string, spec: ItemSpec): Promise<string> {
  const key = inboxKey(userId, spec.id)
  const withFile = spec.withFile ?? spec.state !== 'done'
  if (withFile) await h.env.FILES!.put(key, new Uint8Array([1, 2, 3]))
  await h.env.DB.prepare(
    `INSERT INTO inbox_items (id, user_id, provider, provider_activity_id, file_key, file_size, state, received_at)
     VALUES (?, ?, 'garmin', ?, ?, 3, ?, ?)`,
  )
    .bind(
      spec.id,
      userId,
      `garmin-${spec.id}`,
      withFile ? key : null,
      spec.state,
      spec.receivedAt ?? START,
    )
    .run()
  return key
}

describe('account deletion and the inbox', () => {
  it('sweeps an account whose only files are waiting in its inbox', async () => {
    const h = createHarness()
    const { token, uid } = await signedInUser(h, 'inbox@example.test')
    const key = await seedItem(h, uid, { id: 'item-1', state: 'pending' })

    const res = await h.send({ method: 'DELETE', path: '/api/me', cookies: { rca_session: token } })

    expect(res.status).toBe(204)
    expect(await h.env.FILES!.head(key)).toBeNull()
    expect(await countOf('SELECT COUNT(*) AS n FROM inbox_items')).toBe(0)
  })

  it('sweeps when a row names no file yet, as a push that inserted its row puts the file after', async () => {
    const h = createHarness()
    const { token, uid } = await signedInUser(h, 'racing@example.test')
    await seedItem(h, uid, { id: 'item-5', state: 'pending', withFile: false })
    const landing = inboxKey(uid, 'item-5')
    await h.env.FILES!.put(landing, new Uint8Array([4]))

    const res = await h.send({ method: 'DELETE', path: '/api/me', cookies: { rca_session: token } })

    expect(res.status).toBe(204)
    expect(await h.env.FILES!.head(landing)).toBeNull()
  })
})

describe('turning original files off and the inbox', () => {
  it('deletes the kept originals and leaves the files waiting in the inbox', async () => {
    const h = createHarness()
    const { token, uid } = await signedInUser(h, 'keeper@example.test')
    const id = await addActivity(h, token, START)
    const uploaded = await h.send({
      method: 'PUT',
      path: `/api/activities/${id}/file`,
      raw: new TextEncoder().encode(String(START)),
      cookies: { rca_session: token },
    })
    expect(uploaded.status).toBe(200)
    const waiting = await seedItem(h, uid, { id: 'item-2', state: 'pending' })
    const failed = await seedItem(h, uid, { id: 'item-3', state: 'failed' })

    const off = await h.send({
      method: 'PUT',
      path: '/api/profile',
      json: { massKg: 75, bikeMassKg: 9, units: 'imperial', keepFiles: false },
      cookies: { rca_session: token },
    })

    expect(off.status).toBe(200)
    expect(await h.env.FILES!.head(activityFileKey(uid, id))).toBeNull()
    expect(await h.env.FILES!.head(waiting)).not.toBeNull()
    expect(await h.env.FILES!.head(failed)).not.toBeNull()
  })
})

describe('the orphan scan and the inbox', () => {
  it('keeps an inbox file its row names and deletes one no row names', async () => {
    const h = createHarness()
    const { uid } = await signedInUser(h, 'orphans@example.test')
    const named = await seedItem(h, uid, { id: 'item-4', state: 'failed' })
    const stray = inboxKey(uid, 'no-row')
    await h.env.FILES!.put(stray, new Uint8Array([9]))

    await runMaintenance(h.env, at(AFTER_GRACE))

    expect(await h.env.FILES!.head(named)).not.toBeNull()
    expect(await h.env.FILES!.head(stray)).toBeNull()
  })
})

describe('inbox expiry', () => {
  it('deletes settled rows after a week and failed items with their files after 30 days', async () => {
    const h = createHarness()
    const { uid } = await signedInUser(h, 'expiry@example.test')
    const now = START + (FAILED_INBOX_RETENTION_DAYS + 1) * DAY
    const settledCut = now - SETTLED_INBOX_RETENTION_DAYS * DAY
    const failedCut = now - FAILED_INBOX_RETENTION_DAYS * DAY
    await seedItem(h, uid, { id: 'done-old', state: 'done', receivedAt: settledCut - 1 })
    await seedItem(h, uid, { id: 'done-new', state: 'done', receivedAt: settledCut + 1 })
    const stale = await seedItem(h, uid, {
      id: 'pending-old',
      state: 'pending',
      receivedAt: settledCut - 1,
    })
    const recent = await seedItem(h, uid, {
      id: 'pending-new',
      state: 'pending',
      receivedAt: settledCut + 1,
    })
    const oldFailure = await seedItem(h, uid, {
      id: 'failed-old',
      state: 'failed',
      receivedAt: failedCut - 1,
    })
    const keptFailure = await seedItem(h, uid, {
      id: 'failed-week',
      state: 'failed',
      receivedAt: settledCut - 1,
    })

    const report = await runMaintenance(h.env, at(now))

    expect(report.inboxExpired).toBe(3)
    const left = await h.env.DB.prepare('SELECT id FROM inbox_items ORDER BY id').all<{
      id: string
    }>()
    expect(left.results.map((row) => row.id)).toEqual(['done-new', 'failed-week', 'pending-new'])
    expect(await h.env.FILES!.head(stale)).toBeNull()
    expect(await h.env.FILES!.head(oldFailure)).toBeNull()
    expect(await h.env.FILES!.head(recent)).not.toBeNull()
    expect(await h.env.FILES!.head(keptFailure)).not.toBeNull()
  })

  it('deletes rows with no R2 bound and leaves their files to the orphan scan', async () => {
    const h = createHarness()
    const { uid } = await signedInUser(h, 'nofiles@example.test')
    const now = START + (FAILED_INBOX_RETENTION_DAYS + 1) * DAY
    await seedItem(h, uid, { id: 'failed-old', state: 'failed', receivedAt: START })

    const report = await runMaintenance({ ...h.env, FILES: undefined }, at(now))

    expect(report.inboxExpired).toBe(1)
    expect(await countOf('SELECT COUNT(*) AS n FROM inbox_items')).toBe(0)
  })

  it('is the retention the privacy page states', () => {
    const page = readFileSync(new URL('../../../web/privacy.html', import.meta.url), 'utf8')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
    expect(page).toContain(
      `A file that could not be read is kept at most ${FAILED_INBOX_RETENTION_DAYS} days.`,
    )
  })
})
