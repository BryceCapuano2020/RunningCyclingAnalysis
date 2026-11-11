import { describe, expect, it } from 'vitest'
import { encodeFit } from '@rca/core/fit'
import { minimisedForUpload } from '@rca/core/import/minimise'
import { createBodiesOfFile } from '@rca/core/import/serverFile'
import { AnalysisSession, type SyncItem } from '@rca/core/session'
import { sampleDataset } from '@rca/core/synthetic'
import type { Activity } from '@rca/core/types'
import { createHarness, type Harness } from '../test/harness.ts'
import { saveContext, saveDigest } from './activities/saveDigest.ts'

/*
 * docs/design/garmin-sync.md section 8: for each synthetic FIT file, the digest the server saves (Garmin's ingest:
 * parse under the server limits, digest, minimise, saveDigest) equals the digest the browser import saves for the same
 * file. The browser half is the tab's own path: AnalysisSession.addFiles hands the sink its item, and the web client
 * minimises it and posts it to POST /api/activities.
 */

const sample = sampleDataset().activities
const run = sample.find((activity) => activity.sport === 'run')!
const ride = sample.find((activity) => activity.sport === 'ride')!

const FIXTURES: { name: string; activity: Activity; gps: boolean }[] = [
  { name: 'run.fit', activity: run, gps: true },
  { name: 'ride.fit', activity: ride, gps: true },
  { name: 'indoor ride.fit', activity: ride, gps: false },
]

/** What the web client posts for each activity of a file it imports (api/client.ts createActivity). */
async function browserBodies(bytes: Uint8Array, fileName: string) {
  const items: SyncItem[] = []
  await new AnalysisSession().addFiles(
    [new File([bytes], fileName)],
    { massKg: 75, bikeMassKg: 9 },
    undefined,
    async (item) => {
      items.push(item)
    },
  )
  return items.map((item) => {
    const sent = minimisedForUpload(item.digest, item.fileName)
    // The client's key order, so the text compares too.
    return { digest: sent.digest, fileName: sent.fileName, fileHash: item.fileHash }
  })
}

async function userIdOf(h: Harness, token: string): Promise<string> {
  const me = await h.send({ path: '/api/me', cookies: { rca_session: token } })
  return ((await me.json()) as { user: { id: string } }).user.id
}

async function storedRows(h: Harness, userId: string) {
  const { results } = await h.env.DB.prepare(
    `SELECT dedupe_key, sport, start_ms, name, digest_version, digest_json, file_name, file_hash
     FROM activities WHERE user_id = ? ORDER BY start_ms`,
  )
    .bind(userId)
    .all()
  return results
}

describe('a FIT file saved the server way', () => {
  it.each(FIXTURES)('stores the digest the browser import stores: $name', async (fixture) => {
    const h = createHarness()
    const bytes = encodeFit(fixture.activity, { gps: fixture.gps })

    const browserToken = await h.signIn('browser@example.test', 'Browser')
    const sent = await browserBodies(bytes, fixture.name)
    expect(sent).toHaveLength(1)
    for (const body of sent) {
      const res = await h.send({
        method: 'POST',
        path: '/api/activities',
        json: body,
        cookies: { rca_session: browserToken },
      })
      expect(res.status).toBe(201)
    }

    const serverUser = await userIdOf(h, await h.signIn('server@example.test', 'Server'))
    const read = await createBodiesOfFile(bytes, fixture.name)
    if (!read.ok) throw new Error(read.reason)
    const ctx = saveContext(h.env, {
      now: () => h.clock.now,
      randomUUID: () => crypto.randomUUID(),
    })
    for (const body of read.bodies) {
      expect((await saveDigest(ctx, serverUser, JSON.parse(body))).status).toBe(201)
    }

    // The request bodies are the same text, and so are the rows they stored.
    expect(read.bodies).toEqual(sent.map((body) => JSON.stringify(body)))
    const browserRows = await storedRows(h, await userIdOf(h, browserToken))
    expect(browserRows).toHaveLength(1)
    expect(await storedRows(h, serverUser)).toEqual(browserRows)
  })

  it('is a duplicate when the browser already saved the same activity', async () => {
    const h = createHarness()
    const bytes = encodeFit(run, { gps: true })
    const token = await h.signIn('both@example.test', 'Both')
    const [body] = await browserBodies(bytes, 'run.fit')
    const posted = await h.send({
      method: 'POST',
      path: '/api/activities',
      json: body,
      cookies: { rca_session: token },
    })
    expect(posted.status).toBe(201)

    const read = await createBodiesOfFile(bytes, 'run.fit')
    if (!read.ok) throw new Error(read.reason)
    const ctx = saveContext(h.env, {
      now: () => h.clock.now,
      randomUUID: () => crypto.randomUUID(),
    })
    const saved = await saveDigest(ctx, await userIdOf(h, token), JSON.parse(read.bodies[0]!))
    expect(saved.status).toBe(200)
    expect(saved.record.id).toBe(((await posted.json()) as { id: string }).id)
  })
})
