import { describe, expect, it } from 'vitest'
import { flatSpeedOfWkg, ridePowerAt } from '@rca/core/display'
import type { ActivityDigest } from '@rca/core/types'
import { nativeCurve, valueAt } from '../../../apps/web/src/ui/records'
import { flat, library, resultOf, sessionOf } from '../support'
import type { Plan } from '../support'

const HOUR_S = 3600
const MASS = 70
/** A printed pace is whole seconds and a printed power whole watts, so a tie within that is not a contradiction. */
const PACE_ROUNDING = 0.005
const POWER_ROUNDING = 0.5

const PLAN: Plan = { years: 5, everyDays: 14, scale: { run: flat(0.9), ride: flat(0.9) } }
const base = library(PLAN)

const scaled = (digest: ActivityDigest, by: number): ActivityDigest => ({
  ...digest,
  curve: digest.curve.map((point) => ({ ...point, value: point.value * by })),
})
/** A digest that holds no effort of an hour or more, as a library of short training days does. */
const withoutHour = (digest: ActivityDigest): ActivityDigest => ({
  ...digest,
  curve: digest.curve.map((point) =>
    point.durationS >= HOUR_S ? { ...point, value: Number.NaN } : point,
  ),
})

/** The ids of an old run and an old ride, about two years and eight months back, and of the days beside them. */
const OLD = { run: 'run-994', ride: 'ride-1001' }
const NEXT = { run: 'run-980', ride: 'ride-987' }
const digestOf = (id: string, by: number) =>
  scaled(
    base.find((digest) => digest.id === id)!,
    by,
  )
/** Short days all round, except the days named, which the library holds in full instead. */
const shortDaysExcept = (ids: string[]) =>
  base.filter((digest) => !ids.includes(digest.id)).map(withoutHour)

/**
 * Libraries that hold a demonstrated hour. Dense: every day long enough has one. Old and isolated: short days all
 * round, and one hour from long ago, within the margin the rest of the athlete's efforts support. Old and backed:
 * two hours from long ago, a long way above the rest, that agree with each other.
 */
const LIBRARIES: Record<string, ActivityDigest[]> = {
  'dense, recent and old': base,
  'old and isolated': [
    ...shortDaysExcept([OLD.run, OLD.ride]),
    digestOf(OLD.run, 1.1),
    digestOf(OLD.ride, 1.1),
  ],
  'old and backed': [
    ...shortDaysExcept([OLD.run, OLD.ride, NEXT.run, NEXT.ride]),
    digestOf(OLD.run, 1.3),
    digestOf(NEXT.run, 1.28),
    digestOf(OLD.ride, 1.5),
    digestOf(NEXT.ride, 1.46),
  ],
}

describe.each(Object.entries(LIBRARIES))('a library with %s hours', (_name, digests) => {
  const session = sessionOf(digests)

  it.each(['default', 'all'] as const)(
    'reads each threshold over %s no slower than the best hour',
    (choice) => {
      const result = resultOf(session, choice)
      const run = valueAt(nativeCurve('run', result), HOUR_S)
      const ride = valueAt(nativeCurve('ride', result), HOUR_S)
      // A period with no hour in it has nothing to contradict.
      if (Number.isFinite(run)) {
        expect(flatSpeedOfWkg(result.runThreshold!.value)).toBeGreaterThanOrEqual(
          run - PACE_ROUNDING,
        )
      }
      if (Number.isFinite(ride)) {
        expect(ridePowerAt(result.rideThreshold!.value, MASS).watts).toBeGreaterThanOrEqual(
          ride - POWER_ROUNDING,
        )
      }
    },
  )

  it('has an hour somewhere in the library to test against', () => {
    const result = resultOf(session, 'all')
    expect(Number.isFinite(valueAt(nativeCurve('run', result), HOUR_S))).toBe(true)
    expect(Number.isFinite(valueAt(nativeCurve('ride', result), HOUR_S))).toBe(true)
  })
})
