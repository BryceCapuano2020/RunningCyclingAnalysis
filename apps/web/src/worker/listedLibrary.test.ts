import type { ActivityRecord } from '@rca/contract'
import { digestActivity } from '@rca/core/digest'
import { AnalysisSession, SyncFailure } from '@rca/core/session'
import { DEFAULT_ATHLETE, generateActivity } from '@rca/core/synthetic'
import { encodeFit } from '@rca/core/fit'
import { describe, expect, it } from 'vitest'
import { replaceFromAccount } from './listedLibrary'

const activity = generateActivity(
  DEFAULT_ATHLETE,
  {
    id: 'run-1',
    name: 'Run 1',
    sport: 'run',
    startMs: Date.UTC(2020, 0, 1),
    durationS: 600,
    effort: 'easy',
    terrain: 'flat',
  },
  2,
)
const record = (hasFile: boolean): ActivityRecord =>
  ({ id: 'a1', digest: digestActivity(activity), hasFile }) as unknown as ActivityRecord

describe('the index put on the account’s listing', () => {
  it('keeps the notice of a refused original until the listed record holds the file', async () => {
    const session = new AnalysisSession()
    const file = new File([new Uint8Array(encodeFit(activity, { gps: true }))], 'run-1.fit')
    await session.importFiles([file], undefined, async () => {
      throw new SyncFailure('rate-limited', 'too many requests', true)
    })
    replaceFromAccount(session, [record(false)])
    expect(session.importFacts().syncIssues).toEqual([{ code: 'rate-limited', count: 1 }])
    replaceFromAccount(session, [record(true)])
    expect(session.importFacts().syncIssues).toEqual([])
  })
})
