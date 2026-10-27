import { describe, expect, it } from 'vitest'
import { sampleDigestHashes } from './test/digestHashes'

/**
 * Digests of the sample dataset as main produced them at 8dd5f0b, before the digest speed-up. A
 * change that only makes digesting faster must leave every hash as it is. A change that means to
 * alter digests bumps MODEL_REVISION and copies the received hashes from this test's failure.
 */
const PINNED: Record<string, string> = {
  'sample-01': '3b0eb5494b43d71fdcd7a4153e11f1aeee6c9e25e1cad48c03a3261e972e6d7a',
  'sample-01-gaps': 'e66edc6e2aa980eb327aa3c3a8e48ecaabf85621e513d0679c7154d75a57819e',
  'sample-02': 'c5ce5d23a712686da3fee9e5a9a2e949cf9d5515e0de19b1d7d9bac75c04799c',
  'sample-02-gaps': '88da54380f5e71582f995cb5bcbd220305bc7ecc1a453e75ac72bb2c0b6a340c',
  'sample-03': 'c754d05f8e76da172fbcff474250bdf74daec1db034b68eac8c7c7b0d49c73f0',
  'sample-03-gaps': '11760e00617c6f588c33a832be6cd97f8c3ab18e8f017ca5b8befc1e7327bb4b',
  'sample-04': '6e36356db136a112ce07607afe62c406705e54b8d4f3519950a3afecc6ce4372',
  'sample-04-gaps': '136c76674fd8fa6f9c3fd71f683e9de537a5b313238691e4d7377d28ad739c0e',
  'sample-05': '648ebe9fd02eefe33ba820ab8e612176326c1477ab4289c6b9ab2f57cf88d4b1',
  'sample-05-gaps': 'eba78fe1c02b5f9d9b2139355e7d8435aaa37a847f343ecee3781fca9c2cf7ce',
  'sample-06': '39a02367752ecf1afbeccecb5943dbfd209af530e05da05245a6232da603eeff',
  'sample-06-gaps': '065963d335908ac94eb3ba8b57aa259b20ab42267f20ecaecd17d317259d6dab',
  'sample-07': '75c901a1b3ea5c90976883f00cd7e03531a47f2afad068da926b9fb3c4629a7a',
  'sample-07-gaps': '0e7fc9245ac65aeab53f37deb6fe9675b2f24cc16757a2c21529dd867f7589a6',
  'sample-08': 'dc7492530137b35301a894f4bed1afb14770b75e02faa357447fa800364b6740',
  'sample-08-gaps': 'fda300653587cd6d97618c21c7866f419e2f02ea994b77e5c0e3fbfd7444b8b2',
  'sample-09': 'c9db307221cff6018bd93e48b65a23cbb54e535f4a44f0cd2c8963dbb4df5d49',
  'sample-09-gaps': '2fd089069c5d89da9fd267095e8ff5211a7692e54825ea5acc01dc80a90d7c49',
  'sample-10': '114169d8eb49665ce48f8da09b3503473e5203fc307c456b7f71b440ab8c85e8',
  'sample-10-gaps': '138e8dca70c11b5df4217bdbd5968ce6dc17706f80edb86c6ace286d47721218',
  'sample-11': '77f61bd55a8fa336e8b583c75fe583c8f912f332fc36dadad41582de207d418b',
  'sample-11-gaps': '4f5e4961a3e9f871feddf3671549cf805e8990ac4764f348e9f9429764df3b0d',
  'sample-12': '06b57b165de928c0b527d78da2366a753330f935a33dcbeb633f75208ce3bde0',
  'sample-12-gaps': '53f3cef465f48865067a33e08bdeef99735d6c32853faa0a3c5f7a8bdd021bc3',
  'sample-13': '54ec44bcbad09fbd63865bb79376231f3e2ded08fcb8d099c02310177604236f',
  'sample-13-gaps': '30f30e4464f8521568f79e8ce92501105e21a15812744ecd864ff5b7c55ee56f',
  'sample-14': '27c23c4b1d889d602eb1ce2acbb36b9da749c9da64b5709b22ee2ece0fe3451a',
  'sample-14-gaps': 'afd9fc8dc52bfd714ab0c91d5fbc6ead4d872292733c243dd53dbfb41b35f902',
}

describe('digestActivity output', () => {
  it('is byte for byte the pinned digest of every sample activity and its copy with gaps', async () => {
    expect(await sampleDigestHashes()).toEqual(PINNED)
  })
})
