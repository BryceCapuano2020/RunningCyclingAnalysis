import { describe, expect, it } from 'vitest'
import { lintCopy } from '../findings/copy'
import { fitnessLines } from './copy'
import { noFitness } from './types'
import type { FitnessStatus, Shortfall } from './types'
import type { Sport } from '../types'

const DAY = 86_400_000
const JUN = Date.UTC(2025, 5, 10)

describe('a status that cannot call a trend', () => {
  // A run's level is speed (1000 / 330 is 5:30 /km); a ride's is watts.
  const LEVELS: Record<Sport, { value: number; low: number; high: number }> = {
    run: { value: 1000 / 330, low: 1000 / 340, high: 1000 / 320 },
    ride: { value: 212, low: 205, high: 219 },
  }
  const waiting = (
    shortfall: Shortfall,
    sport: Sport = 'ride',
    over: Partial<FitnessStatus> = {},
  ) =>
    fitnessLines(
      {
        ...noFitness(sport),
        referenceHr: 140,
        steady: 7,
        shortfall,
        level: { ...LEVELS[sport], runs: 7, fromMs: JUN, toMs: JUN + DAY },
        asOfMs: Date.UTC(2025, 9, 25),
        ...over,
      },
      'metric',
    )

  it('tells the level with its range and the activities it is read from, and no slip or rise', () => {
    const lines = waiting({ kind: 'history', have: 7, need: 12, weeks: 7, needWeeks: 8 })
    expect(lines).toEqual({
      headline: '212 W at 140 bpm (205 to 219).',
      support: 'From 7 steady rides.',
      needs: '5 more earlier rides to see a trend.',
    })
    const run = waiting({ kind: 'history', have: 7, need: 12, weeks: 7, needWeeks: 8 }, 'run')
    expect(run.headline).toBe('5:30 /km at 140 bpm (5:20 to 5:40).')
    expect(run.support).toBe('From 7 steady runs.')
    for (const text of [lines.headline, run.headline])
      expect(text).not.toMatch(/slow|fast|less|more|%/)
  })

  it('says the paces of a run in miles for the athlete who counts in them', () => {
    const lines = fitnessLines(
      {
        ...noFitness('run'),
        referenceHr: 140,
        steady: 7,
        level: { ...LEVELS.run, runs: 7, fromMs: JUN, toMs: JUN },
        shortfall: { kind: 'imprecise', within: 0.09 },
      },
      'imperial',
    )
    expect(lines.headline).toBe('8:51 /mi at 140 bpm (8:35 to 9:07).')
  })

  it('says what a trend needs for each shortfall, in the sport’s own words', () => {
    expect(waiting({ kind: 'history', have: 11, need: 12, weeks: 8, needWeeks: 8 }).needs).toBe(
      '1 more earlier ride to see a trend.',
    )
    expect(waiting({ kind: 'history', have: 14, need: 12, weeks: 5, needWeeks: 8 }).needs).toBe(
      'Earlier rides in 3 more weeks to see a trend.',
    )
    expect(waiting({ kind: 'recent', have: 2, need: 4, weeks: 8 }, 'run').needs).toBe(
      '2 more runs in the last 8 weeks to see a trend.',
    )
    expect(waiting({ kind: 'recent', have: 3, need: 4, weeks: 8 }, 'run').needs).toBe(
      '1 more run in the last 8 weeks to see a trend.',
    )
    expect(waiting({ kind: 'imprecise', within: 0.09 }).needs).toBe(
      'More steady rides narrow the range to see a trend.',
    )
    expect(waiting({ kind: 'break', weeksSince: 6 }, 'run').needs).toBe(
      'A steady run in the last 4 weeks to see a trend.',
    )
  })

  it('dates the level of a break, with the year when it is not the status’s own', () => {
    expect(waiting({ kind: 'break', weeksSince: 20 }).headline).toBe(
      '212 W at 140 bpm (205 to 219) in June.',
    )
    expect(
      waiting({ kind: 'break', weeksSince: 20 }, 'ride', { asOfMs: Date.UTC(2026, 0, 12) })
        .headline,
    ).toBe('212 W at 140 bpm (205 to 219) in June 2025.')
    // Only a break is dated: the other shortfalls are the level now.
    expect(waiting({ kind: 'imprecise', within: 0.09 }).headline).not.toMatch(/ in /)
  })

  it('is one line for a sport with fewer than three steady activities, in the sport’s own words', () => {
    const none = (sport: Sport, steady: number) =>
      fitnessLines(
        {
          ...noFitness(sport),
          steady,
          shortfall: { kind: 'history', have: steady, need: 12, weeks: 1, needWeeks: 8 },
        },
        'metric',
      )
    expect(none('ride', 0)).toEqual({
      headline: 'No steady rides with a power meter yet.',
      support: '',
      needs: '',
    })
    expect(none('run', 0).headline).toBe('No steady runs with heart rate yet.')
    expect(none('ride', 1).headline).toBe('1 steady ride with a power meter so far.')
    expect(none('run', 2).headline).toBe('2 steady runs with heart rate so far.')
    expect(none('ride', 2).support + none('ride', 2).needs).toBe('')
  })

  it('says a sport that is not compared is not compared', () => {
    expect(waiting({ kind: 'unavailable' }, 'ride', { level: undefined }).headline).toContain(
      'Rides are not compared',
    )
  })

  it('passes the copy lint and the voice rules in every shortfall, sport and unit', () => {
    const shortfalls: Shortfall[] = [
      { kind: 'history', have: 7, need: 12, weeks: 5, needWeeks: 8 },
      { kind: 'recent', have: 2, need: 4, weeks: 8 },
      { kind: 'break', weeksSince: 6 },
      { kind: 'imprecise', within: 0.09 },
    ]
    for (const sport of ['run', 'ride'] as const) {
      for (const shortfall of shortfalls) {
        const { headline, support, needs } = waiting(shortfall, sport)
        const text = [headline, support, needs].join(' ')
        expect(lintCopy(text)).toEqual([])
        expect(text).not.toMatch(/—|honest|read from|comparable|reference|\bto say\b|\bshown\b/i)
        for (const line of [headline, support, needs]) {
          expect(line.split(/\s+/).length).toBeLessThanOrEqual(12)
        }
      }
    }
  })
})
