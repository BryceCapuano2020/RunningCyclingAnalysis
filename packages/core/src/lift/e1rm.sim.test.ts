/**
 * The e1RM calibration eval (docs/design/e1rm.md, section 8): 100 synthetic lifters a scenario on
 * held-out seeds, curve centre drawn per lifter from N(8.5, 1). It also logs the fixed-centre table, so
 * a change that moves it shows in the log.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { pooledCoverage, SCENARIO_NAMES, scoreScenario } from './test/score'
import type { ScenarioScore } from './test/score'

const LIFTERS = 100
const HELD_OUT = 1
const DRAWN_CENTRE = -1

const pct = (x: number): string => (x * 100).toFixed(1).padStart(5)

function table(title: string, scores: ScenarioScore[]): string {
  const rows = scores.map(
    (s) =>
      `${s.name.padEnd(18)} bias ${pct(s.bias)}  p90 ${pct(s.p90Error)}  in ${pct(s.coverage)} ±${(s.coverageSe * 100).toFixed(1)}  above ${pct(s.above)}  below ${pct(s.below)}  width ${pct(s.width)}`,
  )
  return `${title}\n${rows.join('\n')}\npooled ${pct(pooledCoverage(scores))}`
}

const score = (centre: number): ScenarioScore[] =>
  SCENARIO_NAMES.map((name) => scoreScenario(name, LIFTERS, centre, HELD_OUT))

describe('e1RM calibration on held-out synthetic lifters', () => {
  let drawn: ScenarioScore[] = []
  beforeAll(() => {
    drawn = score(DRAWN_CENTRE)
    console.log(table('drawn centre N(8.5, 1)', drawn))
  })

  it('pooled coverage stays within 80% to 90%', () => {
    const pooled = pooledCoverage(drawn)
    expect(pooled).toBeGreaterThanOrEqual(0.8)
    expect(pooled).toBeLessThanOrEqual(0.9)
  })

  it('no scenario falls under 75% (the two loss scenarios included), and the truth sits above the range rarely', () => {
    for (const s of drawn) {
      expect(s.coverage, `${s.name} coverage`).toBeGreaterThanOrEqual(0.75)
      expect(s.above, `${s.name} above`).toBeLessThanOrEqual(0.2)
    }
    const above = drawn.reduce((a, s) => a + s.above, 0) / drawn.length
    expect(above).toBeLessThanOrEqual(0.15)
  })

  it('median bias stays within 5%, the misspecified lifter within 8%', () => {
    for (const s of drawn) {
      const limit = s.name === 'misspecified' ? 0.08 : 0.05
      expect(Math.abs(s.bias), `${s.name} bias`).toBeLessThanOrEqual(limit)
    }
  })

  it('keeps floor <= low <= point <= high and every figure finite', () => {
    expect(drawn.reduce((a, s) => a + s.orderViolations, 0)).toBe(0)
  })

  it('logs the fixed-centre sensitivity table', () => {
    for (const centre of [7, 8.5, 10]) console.log(table(`fixed centre ${centre}`, score(centre)))
  })
})
