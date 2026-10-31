import { describe, expect, it } from 'vitest'
import type { Activity, ActivityDigest } from '../types'
import { digestActivity } from './digestActivity'
import { REVISIONS } from './revisions'
import { digestHash } from './test/digestHashes'
import { gpxRun, lockedRun } from './test/gateFixtures'
import { droppedSecondRide, loneSpikeRide } from './test/gateFixturesPower'
import { hillRun, ratioRun } from './test/gateFixturesE5'

/**
 * The digest at revision 7 of fixtures that each reach one revision-7 change, pinned, with the fields the change moved
 * listed. `main` is the hash of the digest main made at revision 6 before the changes were written (taken from main
 * e13c94cb; the two power rides from a0eaa437). `less` is the hash of that digest without the fields listed and without
 * the model revision: the digest now, less the same fields, must hash to it, which proves nothing else moved, and
 * `hash` is the digest now. An empty list is a fixture no change reaches: it is the digest of revision 6 with the
 * revision only. `identity.test.ts` and `sessionIdentity.test.ts` are the same proof on the sample dataset.
 */
const FIXTURES: Record<
  string,
  { make: () => Activity; main: string; moved: string[]; hash: string; less: string }
> = {
  'GPX run, strides near 78': {
    make: () => gpxRun(78),
    main: '79380256d06bfc82b211c3c4763f9074708b5551db8b875638a3d92c6cc06151',
    moved: ['walkingPace'],
    hash: 'd8872578955c1ea419103744bc2cd69743f65cd84905b6ce577c2c9ee5136e1b',
    less: '3aaf5957c80cb63ac1a60bc07d35fb74dac0cd18228aabbecfa0cd7f9520f560',
  },
  'GPX run, strides near 55': {
    make: () => gpxRun(55),
    main: '79380256d06bfc82b211c3c4763f9074708b5551db8b875638a3d92c6cc06151',
    moved: [],
    hash: '3e88b2e29b1ac06d351ae79eede6f39ab8a3e90bc1ea8288c20ce30d40befdf7',
    less: '2efc92fbf9b4ea881372a1cbbd57b7b6bd6b1362f2db2f05d7fe5ca69343ef0c',
  },
  'GPX run, steps near 160': {
    make: () => gpxRun(160),
    main: '79380256d06bfc82b211c3c4763f9074708b5551db8b875638a3d92c6cc06151',
    moved: ['walkingPace'],
    hash: 'd8872578955c1ea419103744bc2cd69743f65cd84905b6ce577c2c9ee5136e1b',
    less: '3aaf5957c80cb63ac1a60bc07d35fb74dac0cd18228aabbecfa0cd7f9520f560',
  },
  'FIT run with a 60 s cadence lock': {
    make: () => lockedRun(60),
    main: 'b6b9df48aa7efc45e0d86593e633414d1e002d453bf1b9df1f7ccf8fd0816324',
    moved: [
      'avgHeartRate',
      'curve',
      'distributions',
      'flagCounts',
      'flags',
      'hrBlocks',
      'maxHeartRate',
      'splits',
    ],
    hash: 'c99a0f7b2362a7ed3aab85da3ae3b7f9f0719f5acf832a6467ed2d2f380f30e6',
    less: 'd88eeb140ccf04c93624779c1805109d0db2aa13e7774284e9bb8c5ccce927c0',
  },
  'FIT run without a lock': {
    make: () => lockedRun(0),
    main: '5689f424d2fb92fd539e2cf4ccb9ca35c852c8f30a813a5beee66978ff2bb697',
    moved: [],
    hash: '158b0003772bacfd5e03fe9f77135644f40da3dc20ab77dcd214fd0bc954a4cf',
    less: '4262997f355945ed5cd83bcb0fe05f5924f358d948e0c915a03efa24ffc7d30e',
  },
  'run with a 10% descent': {
    make: () => hillRun(-0.1),
    main: '4c84ada26ce0a7427acdfe0556ec43975d22105871bd2f3df2d01cc5cbc614fd',
    moved: ['curve', 'hrBlocks', 'splits'],
    hash: '8491a1c9dcd6bdde27c724511d689a7f8e1754272f89fcd03ac5471e64573a03',
    less: '5cf930ed8feb817683af036e9ea785ea75165beaf351dc73b742e1e00f3eed22',
  },
  'run with a 3% descent': {
    make: () => hillRun(-0.03),
    main: '664ba3782bb6d5c98574295edbc3e755b55f57c29ef0a1610d130a2366817bda',
    moved: [],
    hash: '35e18a79e5d330af29fbff1e90d6f5bdf34aca5545e1d0a2a02beccab07624bc',
    less: '92d3963d0d405b1535e75184826a64930858f8674995820b46aec1f66ebf3621',
  },
  'flat run with distance 1.1% over its speed': {
    make: () => ratioRun(1.011),
    main: '8065399cf7be614dcce987c2d83ded168bdd5f061d51ded8f3883aefd2ab1050',
    moved: ['splits'],
    hash: 'bacda257fbd77127cf00a8e25cce557b064f204b4f4448ced61047d7378e467b',
    less: 'e8f169f7333901f46071f9e33408ce0b85848de8a5c6d66cdd5f27fa68d3cd25',
  },
  'power ride with one lone 1,500 W second': {
    make: loneSpikeRide,
    main: 'ac39e0caca92ad066b6bd053cbd98ef78d5b59c4d65f2f8a85599c93d09031da',
    moved: [
      'avgPowerW',
      'calibration',
      'curve',
      'distributions',
      'flagCounts',
      'flags',
      'hrBlocks',
    ],
    hash: '48a5ebcb9c7ad0d2742ccb3710cafa69e99895e247bd71c578de460879671646',
    less: 'cdf23cecf75a3280a4af5c4965c79f4c63c910e818680362edebbad6911f0d1d',
  },
  'power ride with one dropped second': {
    make: droppedSecondRide,
    main: 'a0bf264f0121e2e58e894d956d12da81a822ae0111f10096ac1253941fb48b6c',
    moved: ['curve'],
    hash: 'b4578558745b4be9c188c2fd3628194bf610a8ff97e2f0b5355e0a564204ed9f',
    less: '33b9b402ef1b01db7c2adea7b9b93cd6c9d5b6ab3629edc3d1ea21d6a2a1bf5a',
  },
}

/** The digest less the fields a change moved and the model revision. */
function without(digest: ActivityDigest, fields: readonly string[]): ActivityDigest {
  const copy: Record<string, unknown> = { ...digest }
  for (const field of [...fields, 'modelRevision']) delete copy[field]
  return copy as unknown as ActivityDigest
}

/** The fields of two digests whose values differ, other than the model revision. */
function moved(a: ActivityDigest, b: ActivityDigest): string[] {
  const x = a as unknown as Record<string, unknown>
  const y = b as unknown as Record<string, unknown>
  return [...new Set([...Object.keys(x), ...Object.keys(y)])]
    .filter((key) => key !== 'modelRevision' && JSON.stringify(x[key]) !== JSON.stringify(y[key]))
    .sort()
}

describe('the digest at revision 7', () => {
  for (const [name, { make, moved: fields, hash, less }] of Object.entries(FIXTURES)) {
    it(`of a ${name} is the pinned digest, and differs from main's only in ${
      fields.length === 0 ? 'its revision' : fields.join(', ')
    }`, async () => {
      const digest = digestActivity(make())
      expect(digest.modelRevision).toBe(7)
      expect(await digestHash(digest)).toBe(hash)
      expect(await digestHash(without(digest, fields))).toBe(less)
    })
  }

  it('moves for the fixtures a change reaches, and only for those', async () => {
    const reached = Object.entries(FIXTURES).filter(([, fixture]) => fixture.moved.length > 0)
    expect(reached.map(([name]) => name)).toEqual([
      'GPX run, strides near 78',
      'GPX run, steps near 160',
      'FIT run with a 60 s cadence lock',
      'run with a 10% descent',
      'flat run with distance 1.1% over its speed',
      'power ride with one lone 1,500 W second',
      'power ride with one dropped second',
    ])
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      // A fixture no change reaches hashes, with its revision put back, to what main made.
      if (fixture.moved.length > 0) continue
      const digest = digestActivity(fixture.make())
      expect(await digestHash({ ...digest, modelRevision: 6 }), name).toBe(fixture.main)
    }
  })

  it('lists the fields it moved among those the revision table declares changed', () => {
    const declared = new Set<string>(REVISIONS.at(-1)!.changes)
    for (const [name, fixture] of Object.entries(FIXTURES)) {
      for (const field of fixture.moved) expect(declared.has(field), `${name}: ${field}`).toBe(true)
    }
    expect(moved(digestActivity(hillRun(-0.1)), digestActivity(hillRun(-0.1)))).toEqual([])
  })
})
