import { copyOfDigest } from '@rca/core/duplicates'
import { digestActivity } from '@rca/core/digest'
import { sampleDataset } from '@rca/core/synthetic'
import type { ActivityDigest } from '@rca/core/types'
import { describe, expect, it } from 'vitest'
import { workoutKeyOf } from '../../worker/device'
import type { SavedActivity } from '../../worker/protocol'
import { keptIdsOf } from './keptIds'

const [activity] = sampleDataset().activities
if (activity === undefined) throw new Error('The sample has no activities')
const BASE = digestActivity(activity)

function saved(digest: ActivityDigest, fileName: string): SavedActivity {
  const copy = { ...digest, id: `${digest.startMs}-${fileName}` }
  return {
    id: workoutKeyOf(copy),
    name: copy.name,
    startMs: copy.startMs,
    sport: copy.sport,
    copy: copyOfDigest(copy),
  }
}

describe('keptIdsOf', () => {
  it('picks the richest saved copy that starts in the same second as the activity', () => {
    // Two exports of one workout, a few hundred milliseconds apart: one stored identity, one row.
    const gpx = saved({ ...BASE, startMs: 1_700_000_000_100 }, 'run.gpx')
    const fit = saved({ ...BASE, startMs: 1_700_000_000_400 }, 'run.fit')
    const library = [{ id: 'a', sport: BASE.sport, startMs: 1_700_000_000_400 }]

    const ids = keptIdsOf(library as never, [gpx, fit])

    expect(ids.get('a')).toBe(fit.id)
  })

  it('leaves out an activity with no saved copy in its second', () => {
    const other = saved({ ...BASE, startMs: 1_700_000_005_000 }, 'run.fit')
    const library = [{ id: 'a', sport: BASE.sport, startMs: 1_700_000_000_400 }]

    expect(keptIdsOf(library as never, [other]).size).toBe(0)
  })
})
