import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { digestActivity } from './digestActivity'
import { digestHash } from './test/digestHashes'
import { longRun } from './test/gateFixturesE5'

it('captures', async () => {
  const out: Record<string, string> = {}
  for (const km of [43, 41.9, 40]) out[`${km}`] = await digestHash(digestActivity(longRun(km)))
  writeFileSync(process.env.RCA_OUT!, JSON.stringify(out, null, 1))
})
