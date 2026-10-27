import { describe, expect, it } from 'vitest'
import { makeActivity, makeResult } from './components/fixtures'
import { curvePoint } from './charts/fixtures'
import { profileNeedsText, profileOf, profilePoints } from './durationProfile'
import { profileActivities, profileCurve } from './profileFixtures'

describe('profilePoints', () => {
  it('reads a ride’s measured watts, never the curve that includes estimated ones', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideCurve: profileCurve((_, value) => value * 2),
      rideMeasuredCurve: profileCurve(),
    })
    const measured = profileCurve()
    expect(profilePoints(result, 'ride').map((point) => point.value)).toEqual(
      measured.map((point) => point.value),
    )
  })

  it('reads a run’s metabolic curve', () => {
    const result = makeResult({
      activities: profileActivities('run'),
      runCurve: profileCurve(),
      rideMeasuredCurve: [],
    })
    expect(profilePoints(result, 'run')).toHaveLength(18)
  })

  it('names each best’s session by the file holding it when that file holds several, else the activity', () => {
    const result = makeResult({
      activities: [
        makeActivity({ id: 'leg-1', sport: 'ride', sessionKey: 'file-a' }),
        makeActivity({ id: 'leg-2', sport: 'ride', sessionKey: 'file-a' }),
        makeActivity({ id: 'solo', sport: 'ride' }),
      ],
      rideMeasuredCurve: [
        curvePoint(60, 400, 'leg-1'),
        curvePoint(300, 300, 'leg-2'),
        curvePoint(1200, 250, 'solo'),
        curvePoint(3600, NaN, null),
      ],
    })
    expect(profilePoints(result, 'ride').map((point) => point.sessionId)).toEqual([
      'file-a',
      'file-a',
      'solo',
      null,
    ])
  })
})

describe('profileOf', () => {
  it('is ready for a ride with measured power across four sessions', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideMeasuredCurve: profileCurve((durationS, value) =>
        durationS === 1200 ? value * 1.15 : value,
      ),
    })
    const profile = profileOf(result, 'ride')
    expect(profile.status).toBe('ready')
    if (profile.status === 'ready') {
      expect(profile.rows.filter((row) => row.standsOut).map((row) => row.durationS)).toEqual([
        1200,
      ])
    }
  })

  it('is not ready for a ride with only estimated watts', () => {
    const result = makeResult({
      activities: profileActivities('ride', 'measured'),
      rideCurve: profileCurve(),
      rideMeasuredCurve: profileCurve(
        (_, value) => value,
        [5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600],
      ),
    })
    expect(profileOf(result, 'ride').status).toBe('missing')
  })
})

describe('profileOf, asked again', () => {
  it('gives the profile it worked out the first time, for the same result and sport', () => {
    const result = makeResult({
      activities: profileActivities('run'),
      runCurve: profileCurve(),
      rideMeasuredCurve: profileCurve(),
    })
    const first = profileOf(result, 'run')
    expect(profileOf(result, 'run')).toBe(first)
    // Another sport, and another result, are worked out for themselves.
    expect(profileOf(result, 'ride')).not.toBe(first)
    expect(profileOf({ ...result }, 'run')).not.toBe(first)
  })
})

describe('profileNeedsText', () => {
  it('asks a ride for a power meter, and a run for nothing more', () => {
    expect(profileNeedsText('ride', ['short', 'long'])).toBe(
      'Needs a best at 1 min or under and one at 12 min or more, with a power meter',
    )
    expect(profileNeedsText('run', ['short', 'long'])).toBe(
      'Needs a best at 1 min or under and one at 12 min or more',
    )
  })
})
