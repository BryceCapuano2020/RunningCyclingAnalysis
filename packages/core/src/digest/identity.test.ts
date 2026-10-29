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
 * Re-pinned for power bins of one watt (they were five), so a bin never straddles a zone edge: only `distributions.power` of the
 * seven power-meter rides (02, 05, 07, 09, 12, 13, 14) and their copies with gaps moves. Counted back into 5 W bins it is
 * the old distribution; every other field of every digest is as it was.
 */
const PINNED: Record<string, string> = {
  'sample-01': '908687d7d361c8e40dd4c1931404222c6159e03cb1959e303e1655a46cde5138',
  'sample-01-gaps': 'a3f54cc6824c490e38539b28708c33e61a3e4f7484cc5e5c779d8a284bf6dbc8',
  'sample-02': '33229a0f1ae069007c985f2ceb1e6a2bb3feff43f9d82e25df4f6b70c8b1e32d',
  'sample-02-gaps': '473af0cadc1eb15715fa1911c7cfd2fb8c44007762288f2915c819d7171fccbe',
  'sample-03': '5c62abe3e2f4f2d1e419562ab727ab72fa8ad53a4f68c04b0feaba82922508f8',
  'sample-03-gaps': '56595b4428d45500764ff7e66b2744c1c5ffd25b5cdad18d8c89ecd3e59e824d',
  'sample-04': 'b00043e3dbad0cb3e2719b07720c08b36df10a6c69455166b367ec999e13a75a',
  'sample-04-gaps': 'a39416e4321d8e77df5aec40725d0e4f4a6bed4138ed1de9a8b1768cc6357f56',
  'sample-05': 'd2acdb4c78948f28e1d61662a6741b3900c0cb433221206c8851f5e83068b30c',
  'sample-05-gaps': '371b4210114e155fefedb1113486cd7abf08a351fda9275fc273b3d1550e9561',
  'sample-06': 'c133dd569903de52efa3351fec7b698587e6cf2956b6666bef23eade51a42d03',
  'sample-06-gaps': 'a971075ab2cf9f171491e7e1a73ef21a89fd006beafa7ef013da817383595bb3',
  'sample-07': '121d58807f72553f13e01b6810207477d4745baa6697f22e86364a459c06ce0f',
  'sample-07-gaps': '22016c8ef6eff937e9e22dfd5212cd2ea0039937b78101f56f5656505cd581f4',
  'sample-08': 'e4a56bd3d96bdc4c815f9f2a30641d6cf43d8e46e637f983f47ec36a4fed60d6',
  'sample-08-gaps': '82d9d1eea7a80d76fafc8542123f111674ae13bd564fcf3c19c922c036174742',
  'sample-09': '4fb684dbd619be259f6020f128cc0a865414889172e4f289f50d22ffd05ed2d5',
  'sample-09-gaps': '1ce5a414b9d21377512c13013de9485f213aae36df44c49bedd23b54f1f1633d',
  'sample-10': '80e190e5ae70dae97247c180c5391acf5eb2c39571aa57d4be6c14e55754a6bb',
  'sample-10-gaps': '4dbb7769ef7aa7a0313ae394e661abc314c2d1931f8e24dbe8e933c99b7b0276',
  'sample-11': '5eed8d5dcd1bbe69ecd7dd79066dba66fbd0bea37129e80f58a60b671df4ac99',
  'sample-11-gaps': '145387f3d0a1ae584d6dac1b40c0ace747b17cb88e7291bc461e542f08be85aa',
  'sample-12': '42de88264daffe4d7e8062e8adceb1760063acbed61ae57c7704319a1d144408',
  'sample-12-gaps': '5a86a83375ff447ab04eb9aab59f25346492e7136ea1cc9bc4ae129c619bc9a5',
  'sample-13': 'c87f2dfec57019cf42738203612c93209125f7917d84e022782b8e88512d7dd8',
  'sample-13-gaps': 'a8fe9ec58dc9b0cad286a7d4191b5ce3d3b152e792de549cb702f868a0f5e005',
  'sample-14': 'f3321b0568080a67ba06dca00623eb570a26478febfed899417c2293cd7564ff',
  'sample-14-gaps': 'b42a9a2f14a606efb3a93b4489a14b32dab9d99cf64095a903fb4ff21456738a',
}

describe('digestActivity output', () => {
  it('is byte for byte the pinned digest of every sample activity and its copy with gaps', async () => {
    expect(await sampleDigestHashes()).toEqual(PINNED)
  })
})
