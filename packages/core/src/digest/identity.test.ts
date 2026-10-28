import { describe, expect, it } from 'vitest'
import { sampleDigestHashes } from './test/digestHashes'

/**
 * Digests of the sample dataset at the current MODEL_REVISION, first taken from main at 8dd5f0b. A
 * change that only makes digesting faster must leave every hash as it is. A change that means to
 * alter digests bumps MODEL_REVISION and copies the received hashes from this test's failure.
 * Re-pinned at revision 6: the grade is over the distance the speed stream implies.
 */
const PINNED: Record<string, string> = {
  'sample-01': 'b5b98be97e97ce64080055be24b8e5b9e1c162dffecee2259117df2caf3dd3cd',
  'sample-01-gaps': 'bea66c14f9119ec9235e373ea25f88719bed3d4492e04d33c3a75595279488d2',
  'sample-02': '49e5a1d1bc3c1283714a30afe0c2ef006f1808212b68a46d12dc6a9bdd4fa824',
  'sample-02-gaps': '2570419d67c1f548f4edfd19d1683633618a21cfbd467735d4dc966033dcf4b0',
  'sample-03': '4c691d227e0af104ee7065c291b2b9359c0fdfe8c89e8d9894040f84af57209f',
  'sample-03-gaps': '6f1b50f13c2872588576dba30e9f12c0be37ce2ee099f6086b40cc00afbfd6ee',
  'sample-04': '93e59b57a6e4a7c876744e98524ada4879e88c00623dcdfd8f68689dda67f3ef',
  'sample-04-gaps': '34ec2fcd7a2803cfa093754fb93076c119cd3e5f4f00c581b741f82698877b00',
  'sample-05': '67ee253669dcce3051876c6605d4c0b06b11bea8d8fb7e4cd94206f3a6b8f135',
  'sample-05-gaps': '4fe1cff1685d5659a2e371b237457e178387445922481d2b2bd563d1297f6848',
  'sample-06': '84cbd6db9cc3aad1062d8c558d44a1281e2082ba3697b15b8b5e4670f450a193',
  'sample-06-gaps': '737ddb06a470b9a307765b396e58e3df76454594f3e00ffc36f3dd92907f19f0',
  'sample-07': 'adfec73dc60b047867e3364da3c8fd0ffbff6f14bb564508f0eb4ea70ceea925',
  'sample-07-gaps': 'a4c7c1b95eea59c7c2566eb8da3af820d7d9f19d3c1d54e3668682ac84a9ce23',
  'sample-08': 'c5876ac2534ba3179024508584837422c0d21e4631ff8c0f52d9e18453549480',
  'sample-08-gaps': 'bd0c4291498ad5d44ed0892693fe271fbeeae8100a3343def29cd79a6dc7bbf5',
  'sample-09': 'd0c3f3a06c0225b3e01ec7adf8bee2703190e288e66fc090aa4d9b07e45a9482',
  'sample-09-gaps': 'ff459122e9dc0dac74d10c589c74c416b9d19b9add4073ec77974d018727d39f',
  'sample-10': '23649ff6678ce263654befe58320f34acca90d63cb86538097df67261161ed6a',
  'sample-10-gaps': '6ebb62a680d083f67f965c5491e39444662b752fcebaf7f01df82683c10b6cdd',
  'sample-11': '862376adc8af519711dee67147af84e466d167df714708f44ee9a78454284181',
  'sample-11-gaps': '59534eaa356b691310882a88aa22775045b6972373f000df420f5242adf5afea',
  'sample-12': '0424a207caf825a1e2052ca05fb850a877013733b1d346c07b904d81c2124c7e',
  'sample-12-gaps': '573b900c27af9ec13fe241bfa847916b250cb96a23be61ed4abe997c88e5a455',
  'sample-13': '692d006c2f385525ec4063019f04f456a9ccf8e57754ed0aa4d85c09aefed493',
  'sample-13-gaps': '22f6adf574d58f992fa815f8e11ada737749374c7f2f362e00cd5f3fd9022149',
  'sample-14': '6b51572f8969c57f01ed3224c04d0d42e95b7922c5df53ce12c51d361b2afa58',
  'sample-14-gaps': 'b07d661e77043c90dfb0cc352547a444369adbbb1e7010111a7948c66b637c0d',
}

describe('digestActivity output', () => {
  it('is byte for byte the pinned digest of every sample activity and its copy with gaps', async () => {
    expect(await sampleDigestHashes()).toEqual(PINNED)
  })
})
