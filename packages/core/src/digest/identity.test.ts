import { describe, expect, it } from 'vitest'
import { sampleDigestHashes } from './test/digestHashes'

/**
 * Digests of the sample dataset as main produced them at 8dd5f0b, before the digest speed-up. A
 * change that only makes digesting faster must leave every hash as it is. A change that means to
 * alter digests bumps MODEL_REVISION and copies the received hashes from this test's failure.
 */
const PINNED: Record<string, string> = {
  'sample-01': '3b0eb5494b43d71fdcd7a4153e11f1aeee6c9e25e1cad48c03a3261e972e6d7a',
  'sample-01-rough': '26d671b76bc107037bd3283ef9a544b7070944b2d4a906064fd026882cdd60c9',
  'sample-02': 'c5ce5d23a712686da3fee9e5a9a2e949cf9d5515e0de19b1d7d9bac75c04799c',
  'sample-02-rough': '8142279eab84aefc003e4f50f1aeb027515a8c74321dc5b35f3e043c076daf7a',
  'sample-03': 'c754d05f8e76da172fbcff474250bdf74daec1db034b68eac8c7c7b0d49c73f0',
  'sample-03-rough': '2894ddc118281a75c59535e5d1c25874bfb2343fdf067c408cd39172775559d2',
  'sample-04': '6e36356db136a112ce07607afe62c406705e54b8d4f3519950a3afecc6ce4372',
  'sample-04-rough': '9fca5b787d8ad57b5f1f5c6f4ca4156049944d6f534cd5e3f102cf73c0dd86a3',
  'sample-05': '648ebe9fd02eefe33ba820ab8e612176326c1477ab4289c6b9ab2f57cf88d4b1',
  'sample-05-rough': 'c89dfc8da3e9d21fc6fd67e28cb6ed2c97239b7c02909c5138b110ae51cb6649',
  'sample-06': '39a02367752ecf1afbeccecb5943dbfd209af530e05da05245a6232da603eeff',
  'sample-06-rough': '9c4ffe9752d7357719f16cf180a7c4392718d98506ba9294fa552d709c6d137a',
  'sample-07': '75c901a1b3ea5c90976883f00cd7e03531a47f2afad068da926b9fb3c4629a7a',
  'sample-07-rough': '81bb82af029dca668c7e35d8f9ee250ca0dbf2f255bae3485aea5ade9ed905ea',
  'sample-08': 'dc7492530137b35301a894f4bed1afb14770b75e02faa357447fa800364b6740',
  'sample-08-rough': '986a554356cb7965ba93cb87a7f51c9fdc31456d58b1d973e46aae005af85749',
  'sample-09': 'c9db307221cff6018bd93e48b65a23cbb54e535f4a44f0cd2c8963dbb4df5d49',
  'sample-09-rough': '8d5b3f1b9d0c1854b6d97bf67a4b9afbf63f2052666b1c67b2385dbe747a2457',
  'sample-10': '114169d8eb49665ce48f8da09b3503473e5203fc307c456b7f71b440ab8c85e8',
  'sample-10-rough': 'c1bd12d0da5293b93ceb74b2b0ab3ba0ab98e11faa7773843a059afeacf85c0d',
  'sample-11': '77f61bd55a8fa336e8b583c75fe583c8f912f332fc36dadad41582de207d418b',
  'sample-11-rough': 'ebcc1bbcaf5e7edf0b3fa6339b32796eb798aa8d12961f059ba8b366b516d289',
  'sample-12': '06b57b165de928c0b527d78da2366a753330f935a33dcbeb633f75208ce3bde0',
  'sample-12-rough': '662c41560899e344e5eafd90c91d99e5059da01dcfa2c88fcd6a1bc5f8e6fac8',
  'sample-13': '54ec44bcbad09fbd63865bb79376231f3e2ded08fcb8d099c02310177604236f',
  'sample-13-rough': 'a34ce197ae68f03a09a2f545de0a84aa25eb175c33f4170ae12e744624a4606a',
  'sample-14': '27c23c4b1d889d602eb1ce2acbb36b9da749c9da64b5709b22ee2ece0fe3451a',
  'sample-14-rough': '1fa96a2c631d57620f08a9ad62c8e42f3554f467b15afceb2e23c2ae37a7c070',
}

describe('digestActivity output', () => {
  it('is byte for byte the pinned digest of every sample activity and its rough copy', async () => {
    expect(await sampleDigestHashes()).toEqual(PINNED)
  })
})
