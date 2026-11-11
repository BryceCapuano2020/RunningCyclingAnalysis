import { runInNewContext } from 'node:vm'
import { setFlagsFromString, getHeapStatistics } from 'node:v8'
import { describe, expect, it } from 'vitest'
import { copiedLibrary } from '../../../../packages/core/src/test/libraryFixture'
import { seedLiftSets } from '../test/liftRows.ts'
import { seedDigests, stateWorld } from '../test/stateKit.ts'
import { runStateJob } from './job.ts'
import { SERVER_STATE_MAX_ACTIVITIES } from './flag.ts'

/**
 * Memory of the state job on synthetic libraries of 1,000 to 5,000 activities (docs/design/server-compute.md, decision 11).
 * The repository has no workerd test pool yet, so this measures the V8 heap of the job in Node, which is the isolate's heap
 * without workerd's own overhead: the figure is a floor, and apps/api/LIMITS.md says so. The peak is the largest heap seen
 * at each D1 read and at the R2 write (after the analysis and the encoding, before the state is released), garbage included.
 */
setFlagsFromString('--expose-gc')
const gc = runInNewContext('gc') as () => void
const MiB = 1024 * 1024
const used = () => getHeapStatistics().used_heap_size

/** The 128 MB the isolate holds, heap and Wasm together. */
const ISOLATE_MIB = 128

/** The most lift sets an account holds (the check on users.lift_count). */
const MAX_LIFT_SETS = 60_000

async function measure(count: number, liftSets: number, limitMiB = ISOLATE_MIB / 2): Promise<void> {
  {
    const w = await stateWorld({ email: `memory-${count}-${liftSets}@example.com` })
    const library = copiedLibrary(count, { hard: true })
    w.h.clock.now = Math.max(...library.map((digest) => digest.startMs)) + 7_200_000
    await seedDigests(w.env.DB, w.userId, library)
    if (liftSets > 0) await seedLiftSets(w.env.DB, w.userId, liftSets)
    const stored = await w.env.DB.prepare(
      'SELECT sum(length(digest_json)) AS bytes FROM activities WHERE user_id = ?',
    )
      .bind(w.userId)
      .first<{ bytes: number }>()
    gc()
    const baseline = used()
    let peak = baseline
    const sample = () => void (peak = Math.max(peak, used()))
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
    const outcome = await runStateJob({ ...w.env, DB: db, FILES: bucket }, w.deps, w.userId, {
      maxActivities: Number.POSITIVE_INFINITY,
    })
    expect(outcome).toBe('written')
    const peakMiB = (peak - baseline) / MiB
    console.log(
      JSON.stringify({
        event: 'state_job_memory',
        activities: count,
        liftSets,
        digestMiB: Math.round((stored!.bytes / MiB) * 10) / 10,
        peakHeapMiB: Math.round(peakMiB * 10) / 10,
      }),
    )
    if (count <= SERVER_STATE_MAX_ACTIVITIES) expect(peakMiB).toBeLessThan(limitMiB)
  }
}

describe('the state job memory', () => {
  it.each([1000, 2000, 3000, 5000])('peak heap for a library of %i activities', (count) =>
    measure(count, 0),
  )

  // Garbage-dependent: 52 and 74 MiB in two runs, so up to over half the isolate, so the bound here is three quarters: LIMITS.md records it as the case to watch.
  it('peak heap for 2,000 activities and the most lift sets an account holds', () =>
    measure(SERVER_STATE_MAX_ACTIVITIES, MAX_LIFT_SETS, (ISOLATE_MIB * 3) / 4))
})
