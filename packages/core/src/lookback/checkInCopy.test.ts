import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setViewerZone } from '../calendar'
import { checkInBetween } from './checkIn'
import type { CheckIn } from './checkIn'
import { checkInText } from './checkInCopy'
import { ago, NOW, runBest, snap } from './test/snapshotFixture'

const BANNED =
  /limiter|weak|strength|holding you back|ahead of|because|caused|possible|level with last time/i
// A month name must be followed by a year.
const MONTH_NO_YEAR =
  /\b(January|February|March|April|May|June|July|August|September|October|November|December)(?! \d{4})\b/

const base = snap({ run: [ago(60)] }, { bests: { run: [runBest(3.5, ago(60))], ride: [] } })

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
  it('gives what was added as a label over its value, with no rows when nothing else was told', () => {
    const c = check({ bests: base.bests })
    expect(checkInText(c, 'metric')).toEqual({
      headline: { label: 'Added since 1 June 2026', value: '2 runs' },
      rows: [],
    })
  })

  it('tells the new best with its gain and date', () => {
    const win = runBest(1000 / 285, ago(2))
    const was = snap(
      { run: [ago(60)] },
      { bests: { run: [runBest(1000 / 290, ago(60))], ride: [] } },
    )
    const live = snap({ run: [ago(60), ago(2)] }, { bests: { run: [win], ride: [] } })
    const text = checkInText(checkInBetween(was, live)!, 'metric')
    expect(text.headline).toEqual({ label: 'Added since 1 June 2026', value: '1 run' })
    expect(text.rows).toEqual([
      {
        label: 'New best 20 min run',
        value: '4:45 /km',
        detail: '5 s faster than before, 30 May 2026',
      },
    ])
  })

  it('tells an older best and the older files, and caps the lines at three', () => {
    const was = snap({ run: [ago(10)] }, { bests: { run: [runBest(3.5, ago(10))], ride: [] } })
    const live = snap(
      { run: [ago(10), ago(900), ago(2)] },
      { bests: { run: [runBest(3.9, ago(900))], ride: [] } },
    )
    const c = checkInBetween(was, live)!
    const text = checkInText(c, 'metric')
    expect(text.rows).toHaveLength(2)
    expect(text.rows[0]).toMatchObject({ label: 'Best 20 min run', value: '4:16 /km' })
    expect(text.rows[0]!.detail).toMatch(/^Older files, 202\d$/)
    expect(text.rows[1]).toMatchObject({ label: 'Runs in older files', value: '1' })
  })

  it('never uses a banned word, and every month has its year', () => {
    const win = runBest(4.2, ago(2))
    const live = snap({ run: [ago(60), ago(2), ago(900)] }, { bests: { run: [win], ride: [] } })
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
})
