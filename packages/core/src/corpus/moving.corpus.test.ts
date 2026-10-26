import { describe, expect, it } from 'vitest'
import { digestActivity } from '../digest/digestActivity'
import { parseActivityFile } from '../import'
import type { Activity } from '../types'
import { corpusReader } from './helpers'

/*
 * Two real Garmin-style FIT files from python-fitparse with seconds the device did not record. One
 * has no timer events, so its only gap is unrecorded; the other has timer pauses as well.
 */
const { bytes } = corpusReader(new URL('../../test-corpus/fitparse/', import.meta.url))

/** Seconds the device was recording and not paused, counted straight from the activity's masks. */
function recordingSeconds(activity: Activity): number {
  let count = 0
  for (let i = 0; i < activity.n; i++) {
    const paused = activity.paused[i] === 1
    const unrecorded = activity.unrecorded?.[i] === 1
    if (!paused && !unrecorded) count++
  }
  return count
}

function activityFrom(name: string): Activity {
  const result = parseActivityFile(bytes(name), name)
  if (!result.ok) throw new Error(`${name} was refused: ${result.reason}`)
  const [activity] = result.activities
  if (activity === undefined) throw new Error(`${name} holds no activity`)
  return activity
}

describe('moving time on real device files', () => {
  it('leaves out the seconds the device did not record, when the file has no timer events', () => {
    const activity = activityFrom('2013-02-06-12-11-14.fit')
    expect(activity.paused.some((paused) => paused === 1)).toBe(false)
    const digest = digestActivity(activity)
    expect(digest.movingS).toBe(recordingSeconds(activity))
    expect(digest.movingS).toBeLessThan(activity.n)
  })

  it('counts each second once when it is both paused and unrecorded, when the file has timer events', () => {
    const activity = activityFrom('2015-10-13-08-43-15.fit')
    expect(activity.paused.some((paused) => paused === 1)).toBe(true)
    expect(digestActivity(activity).movingS).toBe(recordingSeconds(activity))
  })
})
