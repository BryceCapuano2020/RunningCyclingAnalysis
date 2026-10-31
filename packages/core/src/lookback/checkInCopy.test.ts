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
  it('says what was checked when nothing moved, in one line', () => {
    const c = check({ bests: base.bests, fitness: { run: holding(), ride: null } })
    expect(checkInText(c, 'metric')).toEqual({
      headline:
        '2 runs added since 1 June 2026. Nothing moved: no new bests, and run fitness shows no clear change, within 2% of before.',
      lines: [],
    })
  })

  it('says only no new bests for a library with no fitness', () => {
    const c = check({ bests: base.bests })
    expect(checkInText(c, 'metric').headline).toBe(
      '2 runs added since 1 June 2026. Nothing moved: no new bests.',
    )
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
    expect(text.headline).toBe('Since 1 June 2026: 1 run added.')
    expect(text.lines).toEqual([
      'Run fitness was holding at your last import; it is slipping now.',
      'New best 20 min run: 4:45 /km, 5 s faster than before, set on 30 May 2026.',
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
    expect(text.lines).toHaveLength(3)
    expect(text.lines[0]).toBe('Run fitness was recovering at your last import; it is back now.')
    expect(text.lines[1]).toMatch(
      /^Found in older files: your best 20 min run is 4:16 \/km, from 202\d\.$/,
    )
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
    for (const t of all)
      for (const sentence of [t.headline, ...t.lines]) {
        expect(sentence).not.toMatch(BANNED)
        expect(sentence).not.toMatch(MONTH_NO_YEAR)
        expect(sentence).not.toMatch(/—/)
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
    }
    expect(run('America/Los_Angeles')).toMatch(/since 1 June 2026\./)
    expect(run('UTC')).toMatch(/since 2 June 2026\./)
  })

  it('says a state that has not changed in words that fit it, and a sport that became readable', () => {
    const staying = checkInBetween(
      snap({ run: [ago(60)] }, { fitness: { run: holding({ state: 'back' }), ride: null } }),
      snap(
        { run: [ago(60), ago(1)] },
        { fitness: { run: holding({ state: 'back' }), ride: null } },
      ),
    )!
    expect(checkInText(staying, 'metric').headline).toContain(
      'run fitness shows no clear change, within 2% of before',
    )
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
    expect(checkInText(stayingNoRange, 'metric').headline).toContain(
      'run fitness is staying at your old level',
    )
    const readable = checkInBetween(
      snap(
        { run: [ago(60)] },
        { fitness: { run: holding({ state: 'not-enough-evidence' }), ride: null } },
      ),
      snap({ run: [ago(60), ago(1)] }, { fitness: { run: holding(), ride: null } }),
    )!
    expect(checkInText(readable, 'metric').lines).toEqual([
      'Run fitness could not be read at your last import; it is holding now.',
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
    expect(checkInText(moved, 'metric').lines).toEqual([
      'Run fitness was holding at your last import; it is improved now.',
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
    expect(checkInText(same, 'metric').headline).toContain('run fitness is still improved')
  })
})
