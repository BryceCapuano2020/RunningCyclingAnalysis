import { digestActivity } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import { describe, expect, it } from 'vitest'
import { summarizeAdded } from './importSummary'

const digests = sampleDataset().activities.map((activity) => digestActivity(activity))

describe('summarizeAdded', () => {
  it('counts the runs and rides and spans their start times', () => {
    const starts = digests.map((digest) => digest.startMs)
    expect(summarizeAdded(digests)).toEqual({
      runs: digests.filter((digest) => digest.sport === 'run').length,
      rides: digests.filter((digest) => digest.sport === 'ride').length,
      firstStartMs: Math.min(...starts),
      lastStartMs: Math.max(...starts),
    })
  })

  it('counts nothing and gives no span when the import added no activity', () => {
    expect(summarizeAdded([])).toEqual({ runs: 0, rides: 0 })
    expect(summarizeAdded([])).not.toHaveProperty('firstStartMs')
  })
})
