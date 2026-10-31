import { describe, expect, it } from 'vitest'
import type { Activity } from '../types'
import { digestActivity, digestActivityAt } from './digestActivity'
import { digestHash } from './test/digestHashes'
import { gpxRun, lockedRun } from './test/gateFixtures'

/**
 * The revision-7 gate is closed in production: a digest made at `MODEL_REVISION` 6 is byte for byte what it
 * was before the gated changes existed. The hashes below were taken from main (e13c94cb) before the gate was
 * written, on fixtures that each reach one gated change. `identity.test.ts` and `sessionIdentity.test.ts`
 * are the same proof on the sample dataset and are unchanged by the gate.
 */
const MAIN: Record<string, { make: () => Activity; hash: string }> = {
  'GPX run, strides near 78': {
    make: () => gpxRun(78),
    hash: '79380256d06bfc82b211c3c4763f9074708b5551db8b875638a3d92c6cc06151',
  },
  'GPX run, strides near 55': {
    make: () => gpxRun(55),
    hash: '79380256d06bfc82b211c3c4763f9074708b5551db8b875638a3d92c6cc06151',
  },
  'GPX run, steps near 160': {
    make: () => gpxRun(160),
    hash: '79380256d06bfc82b211c3c4763f9074708b5551db8b875638a3d92c6cc06151',
  },
  'FIT run with a 60 s cadence lock': {
    make: () => lockedRun(60),
    hash: 'b6b9df48aa7efc45e0d86593e633414d1e002d453bf1b9df1f7ccf8fd0816324',
  },
  'FIT run without a lock': {
    make: () => lockedRun(0),
    hash: '5689f424d2fb92fd539e2cf4ccb9ca35c852c8f30a813a5beee66978ff2bb697',
  },
}

describe('the digest below revision 7', () => {
  for (const [name, { make, hash }] of Object.entries(MAIN)) {
    it(`of a ${name} is the digest main made, by default and at revision 6`, async () => {
      expect(await digestHash(digestActivity(make()))).toBe(hash)
      expect(await digestHash(digestActivityAt(make(), 6))).toBe(hash)
    })
  }

  it('moves for the same fixtures once the gate is open, so the proof above can fail', async () => {
    const moved = [
      'GPX run, strides near 78',
      'GPX run, steps near 160',
      'FIT run with a 60 s cadence lock',
    ]
    for (const name of moved) {
      expect(await digestHash(digestActivityAt(MAIN[name]!.make(), 7)), name).not.toBe(
        MAIN[name]!.hash,
      )
    }
  })
})
