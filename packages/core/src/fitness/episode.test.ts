import { describe, expect, it } from 'vitest'
import { episodeStep, openEpisode, quietNow } from './episode'
import { FITNESS } from './params'
import type { RunPoint } from './windows'

const E = FITNESS.episode
const JITTER = [0.012, -0.012, 0.004, -0.004, 0.008, -0.008]

/** Three runs a week from `fromWeek` to `toWeek` at `level`, with a jitter of about 1%. */
function runs(fromWeek: number, toWeek: number, level: number): RunPoint[] {
  const points: RunPoint[] = []
  let k = 0
  for (let w = fromWeek; w < toWeek; w++) {
    for (let i = 0; i < 3; i++) {
      points.push({
        id: `e${w}-${i}`,
        t: w * 7 + 1 + i * 2,
        x: level + JITTER[k++ % JITTER.length]!,
      })
    }
  }
  return points
}

/** An episode declared at week 60 against a reference of 0 (24 runs), dated to the start of that week. */
const episode = () => openEpisode(60, 0.02, 0, 24, 60 * 7, null)

describe('when the drop is no longer clear', () => {
  const day = (week: number) => (week + 1) * 7

  it('counts only the runs after the onset: the level before it cannot make a fresh drop look small', () => {
    // Fifty weeks at the reference, then a drop of 6% with only three runs since the onset: nothing to say yet.
    const early = [...runs(0, 60, 0), ...runs(60, 62, -0.06)]
    expect(quietNow(early, day(62), episode())).toBe(false)
  })

  it('is quiet once enough runs since the onset reach the reference within their range', () => {
    const settled = [...runs(0, 60, 0), ...runs(60, 76, -0.01)]
    expect(quietNow(settled, day(76), episode())).toBe(true)
  })

  it('is not quiet while the runs since the onset are clearly under the reference', () => {
    const down = [...runs(0, 60, 0), ...runs(60, 90, -0.06)]
    expect(quietNow(down, day(90), episode())).toBe(false)
  })
})

describe('the wait before an episode closes', () => {
  /** A level 1.5% under the reference since the onset: inside the range, short of "back" (within 1%). */
  const settled = [...runs(0, 60, 0), ...runs(60, 100, -0.015)]
  const at = (phase: 'low' | 'recovering', quiet: number) => {
    const ep = episode()
    ep.phase = phase
    ep.quietRun = quiet
    return episodeStep(settled, (100 + 1) * 7, 100, ep)
  }

  it('closes a plateau after closeWeeks quiet weeks, and not before', () => {
    expect(at('low', E.closeWeeks - 2).close).toBe(false)
    expect(at('low', E.closeWeeks - 1).close).toBe(true)
  })

  it('waits closeRecoveringWeeks in recovering, so a return gets to "back" first', () => {
    expect(E.closeRecoveringWeeks).toBeGreaterThan(E.closeWeeks)
    expect(at('recovering', E.closeWeeks - 1).close).toBe(false)
    expect(at('recovering', E.closeRecoveringWeeks - 2).close).toBe(false)
    expect(at('recovering', E.closeRecoveringWeeks - 1).close).toBe(true)
  })
})
