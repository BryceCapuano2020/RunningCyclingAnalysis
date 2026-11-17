import { afterEach, describe, expect, it } from 'vitest'
import { UTC_ZONE, setViewerZone } from './calendar'
import { computeSnapshot, type SnapshotInput } from './stateCompute'
import { snapshotCorpus } from './test/snapshotCorpus'
import { check, fc } from './test/property'
import { fixedZone } from './test/zones'

/*
 * The server computes an account's results from its digests, settings, period, clock and zone alone. So the same input twice
 * gives the same snapshot, and the order the digests arrive in (a database read has none promised) changes nothing.
 */

afterEach(() => void setViewerZone(UTC_ZONE))

const library = snapshotCorpus()[0]!

const choices = fc.constantFrom<SnapshotInput['choice']>('all', 'default', 14, 28)
const zones = fc.integer({ min: -12, max: 14 })

function inputOf(
  digests: SnapshotInput['digests'],
  choice: SnapshotInput['choice'],
  hours: number,
): SnapshotInput {
  return {
    digests,
    settings: library.settings,
    choice,
    libraryVersion: 1,
    nowMs: library.nowMs,
    zone: `utc${hours}`,
    buildSha: 'test',
    viewerZone: fixedZone(hours),
  }
}

describe('the account state compute', () => {
  it('is deterministic and independent of the order of the digests', () => {
    check(
      fc.property(
        fc.shuffledSubarray(library.digests, {
          minLength: library.digests.length,
          maxLength: library.digests.length,
        }),
        choices,
        zones,
        (shuffled, choice, hours) => {
          const first = computeSnapshot(inputOf(library.digests, choice, hours))
          expect(computeSnapshot(inputOf(library.digests, choice, hours))).toStrictEqual(first)
          expect(computeSnapshot(inputOf(shuffled, choice, hours))).toStrictEqual(first)
        },
      ),
      8,
    )
  })

  it('does not depend on the digests it is not given: a subset gives the same snapshot in any order', () => {
    check(
      fc.property(
        fc
          .shuffledSubarray(library.digests, { minLength: 1 })
          .chain((subset) =>
            fc.tuple(
              fc.constant(subset),
              fc.shuffledSubarray(subset, { minLength: subset.length, maxLength: subset.length }),
            ),
          ),
        zones,
        ([subset, reordered], hours) => {
          const a = computeSnapshot(inputOf(subset, 'all', hours))
          expect(computeSnapshot(inputOf(reordered, 'all', hours))).toStrictEqual(a)
        },
      ),
      8,
    )
  })
})
