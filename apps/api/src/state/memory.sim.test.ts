import { runInNewContext } from 'node:vm'
import { setFlagsFromString, getHeapStatistics } from 'node:v8'
import { describe, expect, it } from 'vitest'
import { copiedLibrary } from '../../../../packages/core/src/test/libraryFixture'
import { paddedToBytes } from '../test/librarySize.ts'
import { seedLiftSets } from '../test/liftRows.ts'
import { seedDigests, stateWorld } from '../test/stateKit.ts'
import { ACCOUNT_LIMIT_CASE, SMALLER_LIBRARIES } from './memoryCases.ts'
import { runStateJob } from './job.ts'

/**
 * Memory of the state job (docs/design/server-authority.md, C3a): the largest account the quotas admit (ACCOUNT_LIMIT_CASE:
 * every activity, every digest byte and every lift set), and smaller libraries for the curve. The repository has no workerd
 * test pool, so this measures the V8 heap of the job in Node, which is the isolate's heap without workerd's own overhead
 * and a floor; apps/api/LIMITS.md records it beside the workerd heap-limit runs. The peak is the largest heap seen at each
 * D1 read and at the R2 write (after the analysis and the encoding, before the state is released), after a collection.
 */
setFlagsFromString('--expose-gc')
const gc = runInNewContext('gc') as () => void
const MiB = 1024 * 1024
const used = () => getHeapStatistics().used_heap_size

/** The 128 MB the isolate holds, heap and Wasm together. */
const ISOLATE_MIB = 128

interface Library {
  activities: number
  /** Stored digest bytes to pad to, or null for the digests as the fixture makes them. */
  digestBytes: number | null
  liftSets: number
}

/** Seeds the account in a function of its own, so the fixture's objects are unreachable before the baseline is read. */
async function seed(w: Awaited<ReturnType<typeof stateWorld>>, library: Library): Promise<number> {
  const { activities, digestBytes, liftSets } = library
  const fixture = copiedLibrary(activities, { hard: true })
  const digests = digestBytes === null ? fixture : paddedToBytes(fixture, digestBytes)
  w.h.clock.now = Math.max(...digests.map((digest) => digest.startMs)) + 7_200_000
  await seedDigests(w.env.DB, w.userId, digests)
  if (liftSets > 0) await seedLiftSets(w.env.DB, w.userId, liftSets)
  const stored = await w.env.DB.prepare(
    'SELECT sum(length(digest_json)) AS bytes FROM activities WHERE user_id = ?',
  )
    .bind(w.userId)
    .first<{ bytes: number }>()
  return stored!.bytes
}

async function measure(library: Library, limitMiB: number): Promise<void> {
  {
    const { activities, liftSets } = library
    const w = await stateWorld({ email: `memory-${activities}-${liftSets}@example.com` })
    const storedBytes = await seed(w, library)
    gc()
    const baseline = used()
    let peak = baseline
    // A collection first, so the peak is what the job holds live, not how much garbage V8 had not yet collected (which varied
    // from 50 to 200 MiB between runs of the same library).
    const sample = () => {
      gc()
      peak = Math.max(peak, used())
    }
    const db = new Proxy(w.env.DB, {
      get(target, prop) {
        const value: unknown = Reflect.get(target, prop, target)
        if (prop !== 'prepare' || typeof value !== 'function') {
          return typeof value === 'function' ? value.bind(target) : value
        }
        return (query: string) => {
          const statement = Reflect.apply(value, target, [query]) as D1PreparedStatement
          return new Proxy(statement, {
            get(inner, key) {
              const member: unknown = Reflect.get(inner, key, inner)
              if (key === 'bind') {
                return (...args: unknown[]) => Reflect.apply(member as () => never, inner, args)
              }
              if (key === 'all') {
                return async () => {
                  const result = await inner.all()
                  sample()
                  return result
                }
              }
              return typeof member === 'function' ? member.bind(inner) : member
            },
          })
        }
      },
    })
    const bucket = new Proxy(w.env.FILES!, {
      get(target, prop) {
        const value: unknown = Reflect.get(target, prop, target)
        if (prop === 'put') {
          return (...args: Parameters<R2Bucket['put']>) => {
            sample()
            return target.put(...args)
          }
        }
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const outcome = await runStateJob({ ...w.env, DB: db, FILES: bucket }, w.deps, w.userId)
    expect(outcome).toBe('written')
    const peakMiB = (peak - baseline) / MiB
    console.log(
      JSON.stringify({
        event: 'state_job_memory',
        activities,
        liftSets,
        digestMiB: Math.round((storedBytes / MiB) * 10) / 10,
        peakHeapMiB: Math.round(peakMiB * 10) / 10,
      }),
    )
    expect(peakMiB).toBeLessThan(limitMiB)
  }
}

describe('the state job memory', () => {
  it.each(SMALLER_LIBRARIES)('peak heap for a library of %i activities', (activities) =>
    measure({ activities, digestBytes: null, liftSets: 0 }, ISOLATE_MIB / 2),
  )

  // Three quarters of the isolate, the 96 MB the workerd heap-limit run must pass; LIMITS.md records the figures.
  it('peak heap for the largest account the quotas admit', () =>
    measure(
      {
        activities: ACCOUNT_LIMIT_CASE.activities,
        digestBytes: ACCOUNT_LIMIT_CASE.digestBytes,
        liftSets: ACCOUNT_LIMIT_CASE.liftSets,
      },
      (ISOLATE_MIB * 3) / 4,
    ))
})
