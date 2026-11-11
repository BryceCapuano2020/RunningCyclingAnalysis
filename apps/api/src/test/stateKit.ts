import { workoutKey } from '@rca/core/duplicates'
import { digestActivity } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import type { ActivityDigest } from '@rca/core/types'
import type { StateMessage } from '../state/message.ts'
import { systemDeps, type Deps } from '../deps.ts'
import type { Bindings } from '../env.ts'
import { createHarness, type Harness } from './harness.ts'

/** A Queue that records what is sent to it. */
export function fakeQueue(): {
  queue: Queue<StateMessage>
  sent: { body: StateMessage; options: QueueSendOptions | undefined }[]
} {
  const sent: { body: StateMessage; options: QueueSendOptions | undefined }[] = []
  const queue = {
    send: async (body: StateMessage, options?: QueueSendOptions) => {
      sent.push({ body, options })
    },
    sendBatch: async () => undefined,
  } as unknown as Queue<StateMessage>
  return { queue, sent }
}

/** A batch of messages for these accounts, with what became of each. */
export function fakeBatch(userIds: string[]): {
  batch: MessageBatch<StateMessage>
  acked: number[]
  retried: { id: number; delaySeconds: number | undefined }[]
  all: { acked: boolean; retried: boolean }
} {
  const acked: number[] = []
  const retried: { id: number; delaySeconds: number | undefined }[] = []
  const all = { acked: false, retried: false }
  const messages = userIds.map((userId, id) => ({
    id: String(id),
    timestamp: new Date(0),
    attempts: 1,
    body: { userId },
    ack: () => void acked.push(id),
    retry: (options?: QueueRetryOptions) =>
      void retried.push({ id, delaySeconds: options?.delaySeconds }),
  }))
  const batch = {
    queue: 'rca-state',
    messages,
    ackAll: () => void (all.acked = true),
    retryAll: () => void (all.retried = true),
  } as unknown as MessageBatch<StateMessage>
  return { batch, acked, retried, all }
}

/** A bucket whose PUT always fails, counting the tries: a compute that got as far as storing its snapshot. */
export function failingPuts(bucket: R2Bucket, tries = { count: 0 }): R2Bucket {
  return new Proxy(bucket, {
    get(target, prop) {
      if (prop === 'put') {
        return async () => {
          tries.count += 1
          throw new Error('r2 down')
        }
      }
      const value: unknown = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** A D1 binding whose statements matching `match` fail, as a D1 error or a migration not yet applied would. */
export function failingDb(db: D1Database, match: RegExp): D1Database {
  const refuse = async () => Promise.reject(new Error('d1 down'))
  const failing: D1PreparedStatement = new Proxy({} as D1PreparedStatement, {
    get: (_target, prop) => (prop === 'bind' ? () => failing : refuse),
  })
  return new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql: string) => (match.test(sql) ? failing : target.prepare(sql))
      }
      const value: unknown = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** The digests of the default synthetic athlete's weeks, digested as the browser digests them. */
export function libraryDigests(): ActivityDigest[] {
  return sampleDataset().activities.map((activity) => digestActivity(activity))
}

/** An instant just after the newest of these digests. */
export function afterNewest(digests: ActivityDigest[]): number {
  return Math.max(...digests.map((digest) => digest.startMs)) + 7_200_000
}

/** Stores digests as the account's rows, one statement per row, in a batch: the way a library that was synced looks. */
export async function seedDigests(
  db: D1Database,
  userId: string,
  digests: readonly ActivityDigest[],
  firstCreatedAt = 1_000,
): Promise<void> {
  const statements = digests.map((digest, index) =>
    db
      .prepare(
        `INSERT INTO activities (id, user_id, dedupe_key, sport, start_ms, name, digest_version,
          digest_json, file_name, file_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userId,
        workoutKey(digest.sport, digest.startMs),
        digest.sport,
        digest.startMs,
        digest.name,
        digest.version,
        JSON.stringify(digest),
        `file-${index}.fit`,
        'a'.repeat(64),
        firstCreatedAt + index,
      ),
  )
  for (let start = 0; start < statements.length; start += 50) {
    await db.batch(statements.slice(start, start + 50))
  }
  await db
    .prepare('UPDATE users SET activity_count = activity_count + ? WHERE id = ?')
    .bind(digests.length, userId)
    .run()
}

export interface StateWorld {
  h: Harness
  env: Bindings
  deps: Deps
  sent: ReturnType<typeof fakeQueue>['sent']
  token: string
  userId: string
  cookies: { rca_session: string }
}

/** A harness with a recording Queue and one signed-in account (with its profile, as sign-in makes it). */
export async function stateWorld(options: { email?: string } = {}): Promise<StateWorld> {
  const { queue, sent } = fakeQueue()
  const h = createHarness({}, { STATE_QUEUE: queue })
  const token = await h.signIn(options.email ?? 'rider@example.com')
  const cookies = { rca_session: token }
  const me = (await (await h.send({ path: '/api/me', cookies })).json()) as {
    user: { id: string }
  }
  sent.length = 0
  return {
    h,
    env: h.env,
    deps: { ...systemDeps, now: () => h.clock.now },
    sent,
    token,
    userId: me.user.id,
    cookies,
  }
}
