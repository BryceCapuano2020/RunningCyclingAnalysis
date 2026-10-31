import { describe, expect, it } from 'vitest'
import { MARATHON_M } from '../constants'
import { digestActivityAt } from './digestActivity'
import { readDigest } from './readDigest'
import { serializeDigest } from './serialize'
import { longRun } from './test/gateFixturesE5'

/**
 * The marathon is a record distance from revision 7 (RCA-019): a run that covers it, or comes within the 1% every
 * distance allows, keeps its fastest time over it. Below revision 7 the digest is as it was, which
 * identity.gate.test.ts proves with hashes from main.
 */
const marathonOf = (km: number, revision: number) =>
  digestActivityAt(longRun(km), revision).distanceBests?.find(
    (best) => best.distanceM === MARATHON_M,
  )

describe('the marathon as a record distance', () => {
  it('is kept by a run that covers it, at its steady pace', () => {
    const best = marathonOf(43, 7)
    expect(best?.seconds).toBeCloseTo(MARATHON_M / 3.5, 0)
  })

  it('is kept, scaled to the distance, by a run up to 1% short of it', () => {
    expect(marathonOf(41.9, 7)).toBeDefined()
    expect(marathonOf(41.7, 7)).toBeUndefined()
  })

  it('is not kept by a run that does not cover it, and the other distances are as they were', () => {
    expect(marathonOf(40, 7)).toBeUndefined()
    const seven = digestActivityAt(longRun(43), 7).distanceBests!.filter(
      (best) => best.distanceM !== MARATHON_M,
    )
    expect(seven).toEqual(digestActivityAt(longRun(43), 6).distanceBests)
  })

  it('is not kept below revision 7', () => {
    expect(marathonOf(43, 6)).toBeUndefined()
  })

  it('is read back by every view of the reader, and kept in order', () => {
    const wire = JSON.parse(serializeDigest(digestActivityAt(longRun(43), 7))) as Record<
      string,
      unknown
    >
    for (const view of ['create', 'stored', 'device'] as const) {
      const bests = readDigest(wire, view).distanceBests!
      expect(bests.at(-1)?.distanceM, view).toBe(MARATHON_M)
      expect(
        bests.map((best) => best.distanceM),
        view,
      ).toEqual([...bests.map((best) => best.distanceM)].sort((a, b) => a - b))
    }
  })
})
