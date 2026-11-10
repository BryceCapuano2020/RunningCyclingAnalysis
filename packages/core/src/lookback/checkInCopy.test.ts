import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setViewerZone } from '../calendar'
import { checkInBetween } from './checkIn'
import type { CheckIn } from './checkIn'
import { checkInText } from './checkInCopy'
import type { SnapshotFitness } from './snapshot'
import { ago, NOW, runBest, snap } from './test/snapshotFixture'

const holding = (extra: Partial<SnapshotFitness> = {}): SnapshotFitness => ({
  state: 'holding',
  referenceHr: 148,
  enteredMs: null,
  within: 0.02,
  ...extra,
})
const BANNED =
  /limiter|weak|strength|holding you back|ahead of|because|caused|possible|level with last time/i
// A month name must be followed by a year.
const MONTH_NO_YEAR =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)(?! \d{4})\b/

const base = snap(
  { run: [ago(60)] },
  { bests: { run: [runBest(3.5, ago(60))], ride: [] }, fitness: { run: holding(), ride: null } },
)

function check(live: Parameters<typeof snap>[1], runs = [ago(60), ago(3), ago(2)]): CheckIn {
  return checkInBetween(base, snap({ run: runs }, live))!
}

beforeEach(() => {
  vi.stubEnv('TZ', 'UTC')
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the words of the check-in', () => {
  it('gives what was added as a label over its value, and what was checked as rows, when nothing moved', () => {
    const c = check({ bests: base.bests, fitness: { run: holding(), ride: null } })
    expect(checkInText(c, 'metric')).toEqual({
      headline: { label: 'Added since 1 June 2026', value: '2 runs' },
      rows: [
        { label: 'Fitness moved', value: 'Nothing' },
        { label: 'Run fitness', value: 'No clear change', detail: 'Within 2%' },
      ],
    })
  })

  it('gives only the headline and nothing moved for a library with no fitness', () => {
    const c = check({ bests: base.bests })
    expect(checkInText(c, 'metric').rows).toEqual([{ label: 'Fitness moved', value: 'Nothing' }])
  })

  it('leads with the card moving, then the new best with its gain and date', () => {
    const win = runBest(1000 / 285, ago(2))
    const was = snap(
      { run: [ago(60)] },
      {
        bests: { run: [runBest(1000 / 290, ago(60))], ride: [] },
        fitness: { run: holding(), ride: null },
      },
    )
    const live = snap(
      { run: [ago(60), ago(2)] },
      {
        bests: { run: [win], ride: [] },
        fitness: {
          run: holding({ state: 'slipping', within: null, enteredMs: ago(1) }),
          ride: null,
        },
      },
    )
    const text = checkInText(checkInBetween(was, live)!, 'metric')
    expect(text.headline).toEqual({ label: 'Added since 1 June 2026', value: '1 run' })
    expect(text.rows).toEqual([
      { label: 'Run fitness', value: 'Slipping', detail: 'Was holding' },
      {
        label: 'New best 20 min run',
        value: '4:45 /km',
        detail: '5 s faster than before, 30 May 2026',
      },
    ])
  })

  it('tells a confirmed recovery and an older best, and caps the lines at three', () => {
    const recovering = holding({ state: 'recovering', within: null })
    const was = snap(
      { run: [ago(10)] },
      {
        bests: { run: [runBest(3.5, ago(10))], ride: [] },
        fitness: { run: recovering, ride: null },
      },
    )
    const live = snap(
      { run: [ago(10), ago(900), ago(2)] },
      {
        bests: { run: [runBest(3.9, ago(900))], ride: [] },
        fitness: { run: holding({ state: 'back' }), ride: null },
      },
    )
    const c = checkInBetween(was, live)!
    const text = checkInText(
      {
        ...c,
        episodes: [
          { sport: 'run', kind: 'slip-back', fromMs: ago(900), toMs: ago(800) },
          { sport: 'run', kind: 'improvement', fromMs: ago(700), toMs: null },
        ],
      },
      'metric',
    )
    expect(text.rows).toHaveLength(3)
    expect(text.rows[0]).toEqual({ label: 'Run fitness', value: 'Back', detail: 'Was recovering' })
    expect(text.rows[1]).toMatchObject({ label: 'Best 20 min run', value: '4:16 /km' })
    expect(text.rows[1]!.detail).toMatch(/^Older files, 202\d$/)
    expect(text.rows[2]!.label).toBe('Slip in older runs')
    expect(text.rows[2]!.value).toMatch(/^\w+ (20\d\d )?to \w+ 20\d\d$/)
  })

  it('never uses a banned word, and every month has its year', () => {
    const win = runBest(4.2, ago(2))
    const live = snap(
      { run: [ago(60), ago(2), ago(900)] },
      {
        bests: { run: [win], ride: [] },
        fitness: {
          run: holding({ state: 'slipping', enteredMs: ago(1), within: null }),
          ride: null,
        },
      },
    )
    const c = checkInBetween(base, live)!
    const all = [checkInText(c, 'metric'), checkInText(c, 'imperial')]
    for (const t of all) {
      const text = JSON.stringify([t.headline, ...t.rows])
      expect(text).not.toMatch(BANNED)
      expect(text).not.toMatch(MONTH_NO_YEAR)
      expect(text).not.toMatch(/—/)
    }
    expect(NOW).toBeGreaterThan(0)
  })

  it('dates the baseline in the readers own zone: an evening import is not tomorrow', () => {
    // 3:30 on 2 June in UTC is 20:30 on 1 June in Los Angeles.
    const evening = Date.UTC(2026, 5, 2, 3, 30)
    const run = (zone: string) => {
      vi.stubEnv('TZ', zone)
      // The app gives the calendar the device's zone (the process's here).
      setViewerZone((ms) => -new Date(ms).getTimezoneOffset())
      const was = snap({ run: [ago(60)] }, { atMs: evening })
      return checkInText(checkInBetween(was, snap({ run: [ago(60), ago(1)] }))!, 'metric').headline
        .label
    }
    expect(run('America/Los_Angeles')).toBe('Added since 1 June 2026')
    expect(run('UTC')).toBe('Added since 2 June 2026')
  })

  it('says a state that has not changed in words that fit it, and a sport that became readable', () => {
    const staying = checkInBetween(
      snap({ run: [ago(60)] }, { fitness: { run: holding({ state: 'back' }), ride: null } }),
      snap(
        { run: [ago(60), ago(1)] },
        { fitness: { run: holding({ state: 'back' }), ride: null } },
      ),
    )!
    expect(checkInText(staying, 'metric').rows).toContainEqual({
      label: 'Run fitness',
      value: 'No clear change',
      detail: 'Within 2%',
    })
    const stayingNoRange = checkInBetween(
      snap(
        { run: [ago(60)] },
        { fitness: { run: holding({ state: 'back', within: null }), ride: null } },
      ),
      snap(
        { run: [ago(60), ago(1)] },
        { fitness: { run: holding({ state: 'back', within: null }), ride: null } },
      ),
    )!
    expect(checkInText(stayingNoRange, 'metric').rows).toContainEqual({
      label: 'Run fitness',
      value: 'At your old level',
    })
    const readable = checkInBetween(
      snap(
        { run: [ago(60)] },
        { fitness: { run: holding({ state: 'not-enough-evidence' }), ride: null } },
      ),
      snap({ run: [ago(60), ago(1)] }, { fitness: { run: holding(), ride: null } }),
    )!
    expect(checkInText(readable, 'metric').rows).toEqual([
      { label: 'Run fitness', value: 'Holding', detail: 'Was no trend' },
    ])
  })

  it('has words for every state, including a rise that has settled', () => {
    const moved = checkInBetween(
      snap({ run: [ago(60)] }, { fitness: { run: holding(), ride: null } }),
      snap(
        { run: [ago(60), ago(1)] },
        { fitness: { run: holding({ state: 'improved' }), ride: null } },
      ),
    )!
    expect(checkInText(moved, 'metric').rows).toEqual([
      { label: 'Run fitness', value: 'Improved', detail: 'Was holding' },
    ])
    const same = checkInBetween(
      snap(
        { run: [ago(60)] },
        { fitness: { run: holding({ state: 'improved', within: null }), ride: null } },
      ),
      snap(
        { run: [ago(60), ago(1)] },
        { fitness: { run: holding({ state: 'improved', within: null }), ride: null } },
      ),
    )!
    expect(checkInText(same, 'metric').rows).toContainEqual({
      label: 'Run fitness',
      value: 'Still improved',
    })
  })
})
