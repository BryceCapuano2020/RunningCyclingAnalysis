import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { request } from '@playwright/test'
import type { FullConfig, TestInfo } from '@playwright/test'
import { digestActivity } from '@rca/core/digest'
import { parseFit } from '@rca/core/fit'
import { CLIENT_HEADERS, enableFileRetention, fixturePath, signInAs } from './helpers.js'
import { setStoredRevision } from './storedRevision.js'

/** The model revision a seeded library's activity is set back to. */
export const LEGACY_REVISION = 1

/** The projects whose tests start from a seeded legacy library. */
const SEEDED_PROJECTS = ['desktop', 'mobile', 'mobile-webkit']

/**
 * The account a test signs in as to find a legacy library waiting for it. Each run of a test (project,
 * repeat, retry) has its own, because the test rebuilds the library it is given.
 */
export function legacyEmail(info: Pick<TestInfo, 'project' | 'repeatEachIndex' | 'retry'>): string {
  return `e2e-legacy-${info.project.name}-${info.repeatEachIndex}-${info.retry}@example.com`
}

/**
 * How many repeats of a seeded test to make libraries for: one, unless the run repeats tests
 * (`--repeat-each=N`), which then needs E2E_REPEAT_EACH=N too.
 */
function repeats(): number {
  const wanted = Number(process.env.E2E_REPEAT_EACH ?? 1)
  return Number.isInteger(wanted) && wanted >= 1 ? wanted : 1
}

async function seedLegacyLibrary(baseURL: string, email: string): Promise<void> {
  const bytes = await readFile(fixturePath('one-run.fit'))
  const parsed = parseFit(new Uint8Array(bytes), 'one-run.fit')
  if (!parsed.ok) throw new Error(`Could not parse the legacy fixture: ${parsed.reason}`)
  const activity = parsed.activities[0]
  if (!activity) throw new Error('The legacy fixture contains no activities')
  const digest = digestActivity(activity)
  const fileHash = createHash('sha256').update(bytes).digest('hex')
  const api = await request.newContext({ baseURL })
  try {
    await signInAs(api, email, 'Ada Lovelace')
    await enableFileRetention(api)
    const created = await api.post('/api/activities', {
      headers: CLIENT_HEADERS,
      data: { digest, fileName: 'one-run.fit', fileHash },
    })
    if (created.status() !== 201)
      throw new Error(`Seeding an activity returned ${created.status()}`)
    const record = (await created.json()) as { id: string }
    const upload = await api.put(`/api/activities/${record.id}/file`, {
      headers: { ...CLIENT_HEADERS, 'Content-Type': 'application/octet-stream' },
      data: bytes,
    })
    if (upload.status() !== 200) throw new Error(`Seeding a file returned ${upload.status()}`)
    // The server refuses a digest from an older model, so the row is set back in its database.
    setStoredRevision(record.id, LEGACY_REVISION)
  } finally {
    await api.dispose()
  }
}

/**
 * Makes the legacy libraries before any test runs. Rewriting a row in the database file directly can
 * fail a request the API serves at the same moment with SQLITE_BUSY, which nothing deployed does, so
 * it is done here, while no test is using the API, and never from inside a test.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const seeded = config.projects.filter(({ name }) => SEEDED_PROJECTS.includes(name))
  for (const project of seeded) {
    const baseURL = project.use.baseURL
    if (baseURL === undefined) throw new Error(`Project ${project.name} has no baseURL`)
    for (let repeatEachIndex = 0; repeatEachIndex < repeats(); repeatEachIndex++) {
      for (let retry = 0; retry <= project.retries; retry++) {
        await seedLegacyLibrary(baseURL, legacyEmail({ project, repeatEachIndex, retry }))
      }
    }
  }
}
