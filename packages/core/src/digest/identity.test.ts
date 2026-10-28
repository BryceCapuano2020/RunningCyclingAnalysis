import { describe, expect, it } from 'vitest'
import { sampleDigestHashes } from './test/digestHashes'

/**
 * Digests of the sample dataset at the current MODEL_REVISION, first taken from main at 8dd5f0b. A
 * change that only makes digesting faster must leave every hash as it is. A change that means to
 * alter digests bumps MODEL_REVISION and copies the received hashes from this test's failure.
 * Re-pinned at revision 6: the grade is over the speed stream's distance and too-fast climbs are masked,
 * and the digest keeps distributions, durability and drift.
 */
const PINNED: Record<string, string> = {
  'sample-01': '908687d7d361c8e40dd4c1931404222c6159e03cb1959e303e1655a46cde5138',
  'sample-01-gaps': '9eb7cbfe990261fc0155d263f7825b61d8c1bd0824e0a1edee2a6ca1a20848a9',
  'sample-02': '445c71027efa1a68e4bcf98a7efd9af0d52621a14f5a8e5a306b620c427ecfa9',
  'sample-02-gaps': 'af9e691ee60bd2eda2283511153ccb3103821502fdc1eb8c4e3093e874844b7a',
  'sample-03': '5c62abe3e2f4f2d1e419562ab727ab72fa8ad53a4f68c04b0feaba82922508f8',
  'sample-03-gaps': '363e63ea53723c6df10053661172f9ddeb066075df3469dd08e78add37ac81dd',
  'sample-04': 'b00043e3dbad0cb3e2719b07720c08b36df10a6c69455166b367ec999e13a75a',
  'sample-04-gaps': '525f5f64afe96bb6ffa27dcecbd292cd09cc99ba46665bcd343835b0e89d871a',
  'sample-05': '391b536c5161ba005333c13aa2f8670b12667b0c807a3a4dc0798f55febc449e',
  'sample-05-gaps': 'cd921274ff01348df3f76ad6c637e518b2265e94442368ba5078da450688eebf',
  'sample-06': 'c133dd569903de52efa3351fec7b698587e6cf2956b6666bef23eade51a42d03',
  'sample-06-gaps': 'b3ce1d7cffe94e3392cfe5b09b4b0a069a5bf9b0812a430f2a99b5ab16aedf0f',
  'sample-07': 'b74a966bf602c83120efb42bb529fadb66c328cbfaa11773205e4d26d5ef569d',
  'sample-07-gaps': 'dff1e6e991c81f4aa505fe1613a3fd1b28c28715dc362b6e4cce5ba730895ac9',
  'sample-08': 'e4a56bd3d96bdc4c815f9f2a30641d6cf43d8e46e637f983f47ec36a4fed60d6',
  'sample-08-gaps': '44618131ffa1233a84f4df4c839741adb71e0f207765e0993a25dcfaba9e74a7',
  'sample-09': '28250e95296cb237ffa786ee09b858cfafdf4c9f8f74f2a305a22d217fbb6f55',
  'sample-09-gaps': '005ed2ea3cca4d43023ad5ad92b3e8b1fdba09ca7582f12613ed1898c269a653',
  'sample-10': '80e190e5ae70dae97247c180c5391acf5eb2c39571aa57d4be6c14e55754a6bb',
  'sample-10-gaps': '26e7df4a5bd16b3c776b9ea1965deadd2e8142cbe069c12ce33a47bc8acacf8f',
  'sample-11': '5eed8d5dcd1bbe69ecd7dd79066dba66fbd0bea37129e80f58a60b671df4ac99',
  'sample-11-gaps': 'fdf2f5bc3a95d7d129de33070b83c79cec748c3a992453cc99c39b4366413301',
  'sample-12': '64f8952f4f0289d03a03ac6dbc3d772c4b61f8e62af3491a3aa8106cb9a966d3',
  'sample-12-gaps': 'd344acb3e7e166a2640aa3fd341be1ee4fe089cac6f0769beb5e057de38d3d1c',
  'sample-13': '7ef769871a3154a64e6935d1038a8af716d684e3bd759335c34f2e7d14e3e6cf',
  'sample-13-gaps': 'e49f1150f085ea7f8f1fe892ae68b891354d5b60c7bf616a50d2075f8a621304',
  'sample-14': '2f3679270fdb4e92dde124ad781675b8ca1730aebf4f68f7f29d8ca8e075354a',
  'sample-14-gaps': '2aca8c9764433703bbbdf259fbc9aa1c53758abb441af6f8d453251450135d6d',
}

describe('digestActivity output', () => {
  it('is byte for byte the pinned digest of every sample activity and its copy with gaps', async () => {
    expect(await sampleDigestHashes()).toEqual(PINNED)
  })
})
