import { describe, expect, it } from 'vitest'
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

  it('says the library was rebuilt, and counts only', () => {
    const c = checkInBetween(
      snap({ run: [ago(60)] }, { revision: 6 }),
      snap({ run: [ago(60), ago(1)] }),
    )!
    expect(checkInText(c, 'metric').headline).toBe(
      'Your library was rebuilt since 1 June 2026, so this import is compared by count only: 1 run added.',
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
    const all = [
      checkInText(c, 'metric'),
      checkInText(c, 'imperial'),
      checkInText({ ...c, modelChanged: true }, 'metric'),
    ]
    for (const t of all)
      for (const sentence of [t.headline, ...t.lines]) {
        expect(sentence).not.toMatch(BANNED)
        expect(sentence).not.toMatch(MONTH_NO_YEAR)
        expect(sentence).not.toMatch(/—/)
      }
    expect(NOW).toBeGreaterThan(0)
  })
})
