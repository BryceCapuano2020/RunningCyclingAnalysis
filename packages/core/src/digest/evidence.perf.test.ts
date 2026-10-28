import { describe, expect, it } from 'vitest'
import { MAX_FILE_SAMPLES } from '../import/result'
import { assessQuality } from '../quality'
import { fastestMs } from '../test/timing'
import { digestEvidence } from './evidence'
import { movingMask } from './masks'
import { syntheticActivity } from './test/syntheticActivity'

/**
 * The distributions, durability and drift of the longest file the importer accepts take about 16 ms
 * locally. The budget is three times that, so a pass per duration or a copy per sample fails it.
 */
const BUDGET_MS = 50

describe('digest evidence performance', () => {
  it(`takes the evidence of a 48-hour power-meter ride in under ${BUDGET_MS} ms`, () => {
    const n = MAX_FILE_SAMPLES
    const power = Float64Array.from({ length: n }, (_, i) => 150 + (i % 97))
    const activity = syntheticActivity({ n, sport: 'ride', power })
    const quality = assessQuality(activity)
    const moving = movingMask(activity)
    const output = { values: activity.power, valid: quality.validPower }
    let points = 0
    const ms = fastestMs(() => {
      points = digestEvidence(activity, quality, moving, output, 'measured').durability!.length
    })
    expect(points).toBe(6)
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
