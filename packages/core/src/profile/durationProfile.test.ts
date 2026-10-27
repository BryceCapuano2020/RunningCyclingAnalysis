import { describe, expect, it } from 'vitest'
import { formatDuration } from '../units'
import { durationProfile, profileNeeds, profileSentence, profileShortNote } from './index'
import type { ProfilePoint, ProfileRow, ReadyProfile } from './index'

/** Morton's three-parameter model: the power held for t seconds. */
function morton(t: number, cp: number, wPrime: number, pmax: number): number {
  return cp + wPrime / (t + wPrime / (pmax - cp))
}

const DURATIONS = [
  5, 10, 15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1200, 1800, 2700, 3600,
]

/** A ride's curve from a known model, spread over four sessions so that none is the only source. */
function modelCurve(change: (durationS: number, value: number) => number = (_, v) => v) {
  return DURATIONS.map((durationS, i): ProfilePoint => ({
    durationS,
    value: change(durationS, morton(durationS, 250, 20_000, 1000)),
    sessionId: `session-${i % 4}`,
  }))
}

/** The curve with one duration's value scaled. */
function scaled(durationS: number, factor: number): ProfilePoint[] {
  return modelCurve((d, value) => (d === durationS ? value * factor : value))
}

function ready(points: ProfilePoint[]) {
  const profile = durationProfile(points)
  if (profile.status !== 'ready') throw new Error(`not ready: ${JSON.stringify(profile)}`)
  return profile
}

const standing = (points: ProfilePoint[]) =>
  ready(points)
    .rows.filter((row) => row.standsOut !== null)
    .map((row) => [row.durationS, row.standsOut])

describe('durationProfile', () => {
  it('finds a curve that follows one model in line with itself everywhere', () => {
    const { rows } = ready(modelCurve())
    expect(rows.map((row) => row.durationS)).toEqual(DURATIONS)
    for (const row of rows) {
      expect(Math.abs(row.residual)).toBeLessThan(0.01)
      expect(row.standsOut).toBeNull()
    }
  })

  it('flags a duration raised 15% as above, and no other', () => {
    const points = scaled(1200, 1.15)
    expect(standing(points)).toEqual([[1200, 'above']])
    expect(ready(points).rows.find((row) => row.durationS === 1200)!.residual).toBeCloseTo(0.15, 1)
  })

  it('flags a short duration raised 15% too', () => {
    expect(standing(scaled(60, 1.15))).toEqual([[60, 'above']])
  })

  it('reports a duration held flat at the next one’s best as below, as possibly untested', () => {
    const at120 = morton(120, 250, 20_000, 1000)
    const points = modelCurve((durationS, value) => (durationS === 60 ? at120 : value))
    expect(standing(points)).toEqual([[60, 'below']])
    const sentence = profileSentence(ready(points), formatDuration)
    expect(sentence).toContain('1 min')
    expect(sentence).toContain('below')
    expect(sentence).toContain('untested')
  })

  it('gives each duration an interval round its residual, wider than the measurement error', () => {
    for (const row of ready(modelCurve()).rows) {
      expect(row.low).toBeLessThan(row.residual)
      expect(row.high).toBeGreaterThan(row.residual)
      expect(row.high - row.low).toBeGreaterThanOrEqual(2 * 1.645 * 0.03 - 1e-9)
    }
  })

  it('stands out only where the interval leaves zero', () => {
    for (const row of ready(scaled(900, 0.8)).rows) {
      expect(row.standsOut !== null).toBe(row.low > 0 || row.high < 0)
    }
  })

  it('is not moved on the others by one low best', () => {
    expect(standing(scaled(300, 0.8))).toEqual([[300, 'below']])
  })

  it('does not change its input and gives the same answer twice', () => {
    const points = scaled(1200, 1.15)
    const copy = structuredClone(points)
    expect(durationProfile(points)).toEqual(durationProfile(points))
    expect(points).toEqual(copy)
  })

  it('leaves out durations outside 5 s to 60 min and ones with no value', () => {
    const points = [
      ...modelCurve(),
      { durationS: 7200, value: 200, sessionId: 'long' },
      { durationS: 2, value: 1500, sessionId: 'short' },
      { durationS: 1500, value: Number.NaN, sessionId: null },
    ]
    expect(ready(points).rows.map((row) => row.durationS)).toEqual(DURATIONS)
  })

  it('shows only 2 to 60 min without a best at 15 s or under', () => {
    const withoutShort = (points: ProfilePoint[]) => points.filter((p) => p.durationS >= 30)
    const profile = ready(withoutShort(modelCurve()))
    expect(profile.anchored).toBe(false)
    expect(profile.rows.map((row) => row.durationS)).toEqual(DURATIONS.filter((d) => d >= 120))
    expect(standing(withoutShort(scaled(600, 1.15)))).toEqual([[600, 'above']])
  })

  it('anchors the short end with a best at 15 s or under', () => {
    expect(ready(modelCurve()).anchored).toBe(true)
  })
})

describe('what a profile needs', () => {
  const missing = (points: ProfilePoint[]) => {
    const profile = durationProfile(points)
    return profile.status === 'missing' ? profile.missing : []
  }

  it('needs five durations', () => {
    const few = modelCurve().filter((p) => [60, 300, 1200, 3600].includes(p.durationS))
    expect(missing(few)).toContain('durations')
  })

  it('needs a best at 1 min or under', () => {
    expect(missing(modelCurve().filter((p) => p.durationS > 60))).toEqual(['short'])
  })

  it('needs a best at 12 min or more', () => {
    expect(missing(modelCurve().filter((p) => p.durationS < 720))).toEqual(['long'])
  })

  it('needs two sessions', () => {
    const oneSession = modelCurve().map(({ durationS, value }): ProfilePoint => ({
      durationS,
      value,
      sessionId: 'only',
    }))
    expect(missing(oneSession)).toEqual(['sessions'])
  })

  it('lists everything missing from an empty curve', () => {
    expect(missing([])).toEqual(['durations', 'short', 'long', 'sessions'])
  })

  it('says what is missing in words', () => {
    expect(profileNeeds(['short', 'long'])).toBe(
      'Needs a best at 1 min or under and one at 12 min or more',
    )
    expect(profileNeeds(['short'])).toBe('Needs a best at 1 min or under')
    expect(profileNeeds(['long'])).toBe('Needs a best at 12 min or more')
    expect(profileNeeds(['sessions'])).toBe('Needs bests from 2 or more sessions')
    expect(profileNeeds(['durations', 'sessions'])).toBe(
      'Needs bests at 5 or more durations and from 2 or more sessions',
    )
  })
})

describe('profileShortNote', () => {
  it('says why the short end is not shown', () => {
    const profile = ready(modelCurve().filter((point) => point.durationS >= 30))
    expect(profileShortNote(profile, formatDuration)).toBe(
      'Shown from 2 min: there is no best at 15 s or under to anchor the short end.',
    )
  })

  it('says nothing when the short end is anchored', () => {
    expect(profileShortNote(ready(modelCurve()), formatDuration)).toBeNull()
  })
})

describe('profileSentence', () => {
  it('says the bests are in line when none stands out', () => {
    expect(profileSentence(ready(modelCurve()), formatDuration)).toBe(
      'Your bests are in line with each other from 5 s to 1 h.',
    )
  })

  it('says an above duration with its size', () => {
    expect(profileSentence(ready(scaled(1200, 1.15)), formatDuration)).toMatch(
      /^Your 20 min best is 1\d% above what your other bests suggest\.$/,
    )
  })

  it('names durations as the caller writes them', () => {
    expect(profileSentence(ready(scaled(3600, 1.2)), (s) => `${s / 60} min`)).toContain(
      'Your 60 min best',
    )
  })

  it('never uses a ranking word', () => {
    const at120 = morton(120, 250, 20_000, 1000)
    const profile = ready(
      modelCurve((durationS, value) =>
        durationS === 60 ? at120 : durationS === 1200 ? value * 1.2 : value,
      ),
    )
    const text = profileSentence(profile, formatDuration).toLowerCase()
    for (const word of ['limiter', 'weak', 'strength', 'holding you back', 'ahead of', 'grade']) {
      expect(text).not.toContain(word)
    }
  })

  it('names a duration only when its interval clears zero by 2%, and leaves a nearer one to the chart', () => {
    const row = (durationS: number, residual: number, low: number): ProfileRow => ({
      durationS,
      residual,
      low,
      high: residual + (residual - low),
      standsOut: 'above',
    })
    const base = (rows: ProfileRow[]): ReadyProfile => ({ status: 'ready', anchored: true, rows })
    const inLine = (durationS: number): ProfileRow => ({
      durationS,
      residual: 0,
      low: -0.05,
      high: 0.05,
      standsOut: null,
    })
    const filler = [inLine(5), inLine(30), inLine(3600)]
    expect(
      profileSentence(
        base([...filler.slice(0, 2), row(300, 0.1, 0.02), ...filler.slice(2)]),
        formatDuration,
      ),
    ).toContain('Your 5 min best is 10% above')
    expect(
      profileSentence(
        base([...filler.slice(0, 2), row(300, 0.05, 0.019), ...filler.slice(2)]),
        formatDuration,
      ),
    ).toBe(
      'Your bests are in line with each other from 5 s to 1 h, apart from small differences on the chart.',
    )
  })

  it('names at most the three that stand out most, in duration order', () => {
    const row = (durationS: number, residual: number): ProfileRow => ({
      durationS,
      residual,
      low: residual - 0.05,
      high: residual + 0.05,
      standsOut: residual > 0 ? 'above' : 'below',
    })
    const profile: ReadyProfile = {
      status: 'ready',
      anchored: true,
      rows: [row(10, 0.3), row(60, -0.1), row(300, 0.2), row(1200, 0.12), row(3600, -0.25)],
    }
    const text = profileSentence(profile, formatDuration)
    expect(text.match(/Your .+? best/g)).toEqual([
      'Your 10 s best',
      'Your 5 min best',
      'Your 1 h best',
    ])
    expect(text).toContain('1 h best is 25% below: it may be relatively low, or untested.')
  })

  it('says once that several below may be relatively low or untested', () => {
    const row = (durationS: number, residual: number): ProfileRow => ({
      durationS,
      residual,
      low: residual - 0.05,
      high: residual + 0.05,
      standsOut: 'below',
    })
    const profile: ReadyProfile = {
      status: 'ready',
      anchored: true,
      rows: [row(60, -0.2), row(120, -0.15)],
    }
    expect(profileSentence(profile, formatDuration)).toBe(
      'Your 1 min best is 20% below what your other bests suggest. Your 2 min best is 15% below. Those below may be relatively low, or untested.',
    )
  })
})
