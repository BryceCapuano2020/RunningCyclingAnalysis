import { describe, expect, it } from 'vitest'
import { sampleDigestHashes } from './test/digestHashes'

/**
 * Digests of the sample dataset at the current MODEL_REVISION, first taken from main at 8dd5f0b. A
 * change that only makes digesting faster must leave every hash as it is. A change that means to
 * alter digests bumps MODEL_REVISION and copies the received hashes from this test's failure.
 * Re-pinned at revision 6: the grade is over the speed stream's distance and too-fast climbs are masked,
 * and the digest keeps distributions, durability and drift; a best window must be mostly moving and a
 * sustained impossible speed is masked, and a run's splits are over its moving time (only the copies with gaps change).
 * Re-pinned for the athlete-relative heart-rate-for-power rule: only sample-12, the simulated strap failure, moves.
 * Its stretch read too low for the power is found by comparison with the ride's own heart rate at the same power
 * and runs 2265 to 2415 s, not 2261 to 2419 s, so the heart rate masked and the figures built on it move with it.
 * The other 13 activities, and every copy with gaps but sample-12's, are unchanged.
 * Re-pinned for revision 7 (D12 F), which writes the changes that were gated behind it. Every digest moves by its model
 * revision (6 to 7). Beyond that only `splits` moves, and only for the runs of the dataset that have splits and a steep
 * enough descent or a distance stream that disagrees with its speed (the split ratio): sample-01, 03, 04, 06, 08 and
 * 10, and their copies with gaps. No sample activity has a power spike, a cadence lock, a GPX cadence, a local time, a
 * temperature or a label, so none of those fields appears. `identity.rev7.test.ts` pins the fixtures that reach each
 * change, with the fields each moved, and holds each digest less those fields to the hash main made.
 */
const PINNED: Record<string, string> = {
  'sample-01': '032a95acbd5f4611a316be29867f19808934c0e1b06837046879921a4be3cf44',
  'sample-01-gaps': 'b5eb4bde51f6423e094f54cb292328125f4da90c80d31996a38e7e5ac4fbcc66',
  'sample-02': '09a8376192cf0a9fa9c4210e4971a012bcafe78eeb84c947606aa43296e680f5',
  'sample-02-gaps': '382fb9536f2792c9b7984a225bdf7734823f5e8d94e8fa93399da8df39f4c836',
  'sample-03': '6ec14113a2fc22826c685755a8d5b6a76f1a0cb8436f9948c7000f5437e6c7f5',
  'sample-03-gaps': '6939f9dadfed6ac01aa6970f0fa16a2abf335401ca81f4c034da2b339b2daf09',
  'sample-04': '2846eca635ddce82fedd9122ea86cd53e8e41b07015528ebd6443cbc6b38155e',
  'sample-04-gaps': 'f2bb186ac3d1c6c2c4874f6bbf5357bfae06e2d6e4f8d59eb8029455d7457394',
  'sample-05': 'a68c9b21bbfe435b8719abd39468d0c093f5e71b9c9268f7ee3810b3965920dc',
  'sample-05-gaps': '4aeb32cbb687c37380bc0875f733ef9ce0a9424c0c762974d3d03148dddb46f3',
  'sample-06': '5a685f532d391de0be05e3b9424337284ef5d850255bf3d0c056bc039b629864',
  'sample-06-gaps': '167196d1b7cf4177f8816f9ddff523e32e138c21f7bcd111b57e1007ab20894b',
  'sample-07': '4c25015b60b1c5fbb65e95db28909d3030171d26cb0b1628c27fc2dee9e7e5d1',
  'sample-07-gaps': 'cee941ab18ed0e1210ace9e3638700301b4cab1bfb744e606befc7140b11a6c2',
  'sample-08': '656e8dc244cac54781e6b08ce1785354e9027dcf8cee9a95f4ae022a34872616',
  'sample-08-gaps': '064a939274a8302b8d8976edb57618bae6448961adb59721212eb9410a56283e',
  'sample-09': 'affc0df2d01275523f1356e549da9342f1f661cfcf96e3d0dfb17b7135fd11c8',
  'sample-09-gaps': 'c57810b791efd708b06fb8f05258f4160f81f3993eb7cfb8241faf30baffaad4',
  'sample-10': 'dda95819eb34c10e647eaab7dbaeeee7fb55b462eff17c2728db2783e7013df8',
  'sample-10-gaps': 'c76752b2f6a4a8d5d6f4f4e6a90253f1571fe0d674ecdc54448d7aec2b74ec9e',
  'sample-11': '0cf4bd849cb47e936f0cfe96967c53df2860e6e77fd736f621cdd363d558011a',
  'sample-11-gaps': 'ad5f9a187341863ade720e294202208a00778df4d2228a6283df3f91902bae6a',
  'sample-12': 'cb49fff4a261b1254bd8f68c8f9194a12bda4e62cb8043d0ca450eb72425c925',
  'sample-12-gaps': 'd426306f6114c36886e3bcabbfafed17583ec140bc6687a2b6a5e7abb86d8415',
  'sample-13': 'bed79321d3202a0b8c67c53abf8bcc28cf4a8adda63e7e8f892e36c95d931787',
  'sample-13-gaps': 'e2b336a2a16f4c3084545b9813d78bfbd1cc6826b3399876e18451d29e553ddf',
  'sample-14': '89899dec5714d612caeb1da6eed6367cc5b47934c0f8fda18812e610925ce07c',
  'sample-14-gaps': '229d376baaf64f311fc1b320810e699bcf5cd7499fca8aa836b53c38415536c1',
}

describe('digestActivity output', () => {
  it('is byte for byte the pinned digest of every sample activity and its copy with gaps', async () => {
    expect(await sampleDigestHashes()).toEqual(PINNED)
  })
})
