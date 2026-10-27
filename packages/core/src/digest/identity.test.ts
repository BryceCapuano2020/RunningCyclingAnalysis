import { describe, expect, it } from 'vitest'
import { sampleDigestHashes } from './test/digestHashes'

/**
 * Digests of the sample dataset as main produced them at 8dd5f0b, before the digest speed-up. A
 * change that only makes digesting faster must leave every hash as it is. A change that means to
 * alter digests bumps MODEL_REVISION and copies the received hashes from this test's failure.
 */
const PINNED: Record<string, string> = {
  'sample-01': '7a1f86d527715c0768cf8d5ea2bbab3f07e9e18d9706ef7f348c6137888e901e',
  'sample-01-gaps': '513eb18d31031b65027f4437f98b70eebb42c3eaaa1ddb0dc785bd617bad5cd5',
  'sample-02': '5f56280b2ccabad3a2fec0cd3bd0f022ae628150fc31c8c0e7d55c2ba93761b5',
  'sample-02-gaps': '304b56d174af84e555871c2a38865a17aaf6ae9f4728411c225562736959b3fc',
  'sample-03': '1b8116f1f6b688995255977b44986ae0a153a949325b16ac62fb4f714aba90db',
  'sample-03-gaps': '77683e4df7d1439505c79437699ade07896c20cd5cd8dba558d8dc0525cdc543',
  'sample-04': 'cf8441b8044c115e0860cb5cd4dfe72b3ac0fb2a3a5b38df1d69dc51c69b2f34',
  'sample-04-gaps': '60df2b8d26007216f045ce39c3aa4a7f87cfbc2f88d7862448c9886d469fb0c1',
  'sample-05': '43d47fe13db6f8942dd07a7775822548f58923b6fcb39bec607af9bbd9e9cd77',
  'sample-05-gaps': 'ada4b6ece84bff69642921d76dfcef10c67554d8d184704e86e5b1f80e9d6b9e',
  'sample-06': '8abc5111613c46d3f88d15a7f4850cf3433d5e92cd67640b1816ac62af328cdd',
  'sample-06-gaps': '2d9adc673f75873b9ec4f313194562fb89b5814b97f944a0c247a107f3a0db27',
  'sample-07': '2d616a4537a03655dbf4ba64657c975250a09e6dc881e7fb72e20491446c5305',
  'sample-07-gaps': '2e82bbd7fe8e234aae62fc2a3a84cb1622591138e3aea3ba4c6c0153bb9437db',
  'sample-08': '6eb85d88fc44fedf80e33065d6b6a1479ae73b591e4e894b6a5e5bc84138df7e',
  'sample-08-gaps': 'f7f5adbc6add6d5921d5e4e9d5252538ce3b47c1a709cb902138f7e1fdafb49b',
  'sample-09': '3426eb425955bf282cca3d6686e20e1ef7e6ca0a2552cd4693f7e224e47d0f73',
  'sample-09-gaps': '533cd658aacfc78e85201cb09022a6084c764dee49fe440c7f6684957da75405',
  'sample-10': 'cfdd80c3a7ac84008b87d855af4028fca3be72a409e206fe0a783d5252d79c17',
  'sample-10-gaps': '649427f966c543f9ed8d31005a14e44c261fb81ddb399b76fa95d819ae8a8b64',
  'sample-11': '4fca1c5af464062cf73a7c99f50b6bc2533a6fc14904f6ed67bb1871cfe2da00',
  'sample-11-gaps': 'f2b1e18a2dfd5494c4cdf900d7c157231ed887e45a5639244c1f734c8a40f5fd',
  'sample-12': 'beecc6ae43a1964bb52db1fe8aa5eaee254df225356377f837d1ee07a0dc8efc',
  'sample-12-gaps': '80f0c8d1370b80843d9c98f0baa10e0c0d369d765c1b0d516c0d36844567a03c',
  'sample-13': 'fad1a7b723fb98db9457868fad9f265e63a8a490a281040039477ed82413e2c7',
  'sample-13-gaps': 'c6fb9c196c922b87cf2c57761962159e6b6df63098b69479af575d79e0ddfcd3',
  'sample-14': '9105e68dd2e167a40e2c378873e64345be201c016220cccc48352b426aae341a',
  'sample-14-gaps': '3339cdc10159025c769e49c3b777d1c224edefc8fe140fac8605cd427f124f3f',
}

describe('digestActivity output', () => {
  it('is byte for byte the pinned digest of every sample activity and its copy with gaps', async () => {
    expect(await sampleDigestHashes()).toEqual(PINNED)
  })
})
