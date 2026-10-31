import { describe, expect, it } from 'vitest'
import { MARATHON_M } from '../constants'
import { digestActivity } from './digestActivity'
import { readDigest } from './readDigest'
import { serializeDigest } from './serialize'
import { longRun } from './test/gateFixturesE5'

/**
 * The marathon is a record distance from revision 7 (RCA-019): a run that covers it, or comes within the 1% every
 * distance allows, keeps its fastest time over it. Revision 6 kept none, and identity.rev7.test.ts holds that nothing else of
 * the digest moved.
 */
const marathonOf = (km: number) =>
  digestActivity(longRun(km)).distanceBests?.find((best) => best.distanceM === MARATHON_M)

describe('the marathon as a record distance', () => {
  it('is kept by a run that covers it, at its steady pace', () => {
    const best = marathonOf(43)
    expect(best?.seconds).toBeCloseTo(MARATHON_M / 3.5, 0)
  })

  it('is kept, scaled to the distance, by a run up to 1% short of it', () => {
    expect(marathonOf(41.9)).toBeDefined()
    expect(marathonOf(41.7)).toBeUndefined()
  })

  it('is not kept by a run that does not cover it', () => {
    expect(marathonOf(40)).toBeUndefined()
  })

  it('is read back by every view of the reader, and kept in order', () => {
    const wire = JSON.parse(serializeDigest(digestActivity(longRun(43)))) as Record<string, unknown>
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
