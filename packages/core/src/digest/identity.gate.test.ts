import { describe, expect, it } from 'vitest'
import type { Activity } from '../types'
import { digestActivity, digestActivityAt } from './digestActivity'
import { digestHash } from './test/digestHashes'
import { gpxRun, lockedRun } from './test/gateFixtures'
import { hillRun, ratioRun } from './test/gateFixturesE5'

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
  'run with a 10% descent': {
    make: () => hillRun(-0.1),
    hash: '4c84ada26ce0a7427acdfe0556ec43975d22105871bd2f3df2d01cc5cbc614fd',
  },
  'run with a 3% descent': {
    make: () => hillRun(-0.03),
    hash: '664ba3782bb6d5c98574295edbc3e755b55f57c29ef0a1610d130a2366817bda',
  },
  'flat run with distance 1.1% over its speed': {
    make: () => ratioRun(1.011),
    hash: '8065399cf7be614dcce987c2d83ded168bdd5f061d51ded8f3883aefd2ab1050',
  },
}

describe('the digest below revision 7', () => {
  for (const [name, { make, hash }] of Object.entries(MAIN)) {
    it(`of a ${name} is the digest main made, by default and at revision 6`, async () => {
      expect(await digestHash(digestActivity(make()))).toBe(hash)
      expect(await digestHash(digestActivityAt(make(), 6))).toBe(hash)
    })
  }

  it('moves for the fixtures a gated change reaches once the gate is open, and only for those', async () => {
    const moves: Record<string, boolean> = {
      'GPX run, strides near 78': true,
      'GPX run, strides near 55': false,
      'GPX run, steps near 160': true,
      'FIT run with a 60 s cadence lock': true,
      'FIT run without a lock': false,
      'run with a 10% descent': true,
      'run with a 3% descent': false,
      'flat run with distance 1.1% over its speed': true,
    }
    expect(Object.keys(moves).sort()).toEqual(Object.keys(MAIN).sort())
    for (const [name, moved] of Object.entries(moves)) {
      // The revision field is set back so that only the digest's content is compared.
      const open = { ...digestActivityAt(MAIN[name]!.make(), 7), modelRevision: 6 }
      expect((await digestHash(open)) !== MAIN[name]!.hash, name).toBe(moved)
    }
  })
})
