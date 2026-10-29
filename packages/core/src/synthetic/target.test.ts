import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../math'
import { applyLag, gradeFunction, holdWindows, rawTarget } from './target'

const cp = 10
const wPrime = 1200
const constant = () => 0.5

describe('rawTarget', () => {
  it('tempo holds 0.6 cp for 10 min, 0.88 cp until 5 min before the end, then 0.55 cp', () => {
    const out = rawTarget('tempo', cp, wPrime, 1800, constant)
    expect(out[0]).toBeCloseTo(6, 12)
    expect(out[599]).toBeCloseTo(6, 12)
    expect(out[600]).toBeCloseTo(8.8, 12)
    expect(out[1499]).toBeCloseTo(8.8, 12)
    expect(out[1500]).toBeCloseTo(5.5, 12)
    expect(out[1799]).toBeCloseTo(5.5, 12)
  })

  it('intervals repeats 4 min at 1.05 cp and 3 min at 0.5 cp after warm-up, then 0.55 cp', () => {
    const out = rawTarget('intervals', cp, wPrime, 3000, constant)
    expect(out[0]).toBeCloseTo(6, 12)
    expect(out[600]).toBeCloseTo(10.5, 12)
    expect(out[839]).toBeCloseTo(10.5, 12)
    expect(out[840]).toBeCloseTo(5, 12)
    expect(out[1019]).toBeCloseTo(5, 12)
    expect(out[1020]).toBeCloseTo(10.5, 12)
    expect(out[2699]).toBeCloseTo(5, 12)
    expect(out[2700]).toBeCloseTo(5.5, 12)
  })

  it('race holds 1.1 cp, above critical power, between a 10 min warm-up and a 5 min cool-down', () => {
    const out = rawTarget('race', cp, wPrime, 2100, constant)
    expect(out[0]).toBeCloseTo(6, 12)
    expect(out[599]).toBeCloseTo(6, 12)
    expect(out[600]).toBeCloseTo(11, 12)
    expect(out[1799]).toBeCloseTo(11, 12)
    expect(out[1800]).toBeCloseTo(5.5, 12)
  })

  it('test effort places efforts at cp + wPrime/duration with 10 min recoveries', () => {
    const out = rawTarget('test', 15, wPrime, 3600, constant)
    expect(out[0]).toBeCloseTo(9, 12)
    expect(out[899]).toBeCloseTo(9, 12)
    expect(out[900]).toBeCloseTo(15 + 1200 / 180, 12)
    expect(out[1079]).toBeCloseTo(15 + 1200 / 180, 12)
    expect(out[1080]).toBeCloseTo(7.5, 12)
    expect(out[1679]).toBeCloseTo(7.5, 12)
    expect(out[1680]).toBeCloseTo(15 + 1200 / 360, 12)
    expect(out[2039]).toBeCloseTo(15 + 1200 / 360, 12)
    expect(out[2040]).toBeCloseTo(7.5, 12)
    expect(out[2640]).toBeCloseTo(15 + 1200 / 720, 12)
    expect(out[3359]).toBeCloseTo(15 + 1200 / 720, 12)
    // The 20-minute effort would end after 3600 s, so it is left out and the rest is easy.
    expect(out[3360]).toBeCloseTo(8.25, 12)
    expect(out[3599]).toBeCloseTo(8.25, 12)
  })

  it('test effort drops every effort that does not fit, leaving easy riding', () => {
    const out = rawTarget('test', 15, wPrime, 1000, constant)
    expect(out[899]).toBeCloseTo(9, 12)
    expect(out[900]).toBeCloseTo(8.25, 12)
    expect(out[999]).toBeCloseTo(8.25, 12)
  })

  it('easy wanders within plus or minus 5% of 0.65 cp', () => {
    const out = rawTarget('easy', cp, wPrime, 7200, mulberry32(3))
    let lo = Infinity
    let hi = -Infinity
    for (const v of out) {
      lo = Math.min(lo, v)
      hi = Math.max(hi, v)
    }
    expect(lo).toBeGreaterThanOrEqual(6.5 * 0.95 - 1e-12)
    expect(hi).toBeLessThanOrEqual(6.5 * 1.05 + 1e-12)
    expect(hi - lo).toBeGreaterThan(0.1)
  })

  it('returns an empty array for zero length', () => {
    expect(rawTarget('easy', cp, wPrime, 0, constant).length).toBe(0)
    expect(rawTarget('test', cp, wPrime, 0, constant).length).toBe(0)
  })
})

describe('applyLag', () => {
  it('approaches a step with a 10 s first-order response', () => {
    const raw = Float64Array.from([0, 10, 10, 10])
    const out = applyLag(raw)
    const alpha = 1 - Math.exp(-0.1)
    expect(out[0]).toBe(0)
    expect(out[1]).toBeCloseTo(10 * alpha, 12)
    expect(out[2]).toBeCloseTo(10 * (1 - Math.pow(1 - alpha, 2)), 12)
  })

  it('starts from the first target so there is no start-up transient', () => {
    expect(applyLag(Float64Array.from([7]))[0]).toBe(7)
  })

  it('returns an empty array for empty input', () => {
    expect(applyLag(new Float64Array(0)).length).toBe(0)
  })

  it('holds a test effort exactly and ramps smoothly into it over the 30 s before', () => {
    const raw = rawTarget('test', 15, wPrime, 3600, constant)
    const holds = holdWindows('test', 3600)
    const out = applyLag(raw, holds)
    const target = 15 + 1200 / 180
    for (let t = 900; t < 1080; t++) expect(out[t]).toBe(target)
    let previous = out[870]!
    expect(previous).toBeGreaterThan(9 - 1e-9)
    for (let t = 871; t < 900; t++) {
      expect(out[t]!).toBeGreaterThanOrEqual(previous - 1e-12)
      previous = out[t]!
    }
    expect(out[899]!).toBeLessThanOrEqual(target)
    expect(out[899]!).toBeGreaterThan(target - 0.1)
  })

  it('leaves the lag untouched outside the hold windows', () => {
    const raw = new Float64Array(100).fill(10)
    raw[0] = 0
    const plain = applyLag(raw)
    const held = applyLag(raw, [{ start: 60, end: 70 }])
    for (let t = 0; t < 30; t++) expect(held[t]).toBe(plain[t])
    expect(held[60]).toBe(10)
    expect(held[69]).toBe(10)
  })
})

describe('holdWindows', () => {
  it('lists the test efforts that fit, and nothing for other efforts', () => {
    expect(holdWindows('test', 3600)).toEqual([
      { start: 900, end: 1080 },
      { start: 1680, end: 2040 },
      { start: 2640, end: 3360 },
    ])
    expect(holdWindows('test', 1000)).toEqual([])
    expect(holdWindows('easy', 3600)).toEqual([])
  })
})

describe('gradeFunction', () => {
  it('is zero on the flat', () => {
    const g = gradeFunction('flat', 100, constant)
    expect(g(0, 0)).toBe(0)
    expect(g(12345, 99)).toBe(0)
  })

  it('rolling stays within a 4% peak and reaches it', () => {
    const g = gradeFunction('rolling', 100, mulberry32(9))
    let hi = -Infinity
    let lo = Infinity
    for (let d = 0; d <= 30000; d++) {
      const v = g(d, 0)
      hi = Math.max(hi, v)
      lo = Math.min(lo, v)
    }
    expect(hi).toBeLessThanOrEqual(0.04 + 1e-12)
    expect(lo).toBeGreaterThanOrEqual(-0.04 - 1e-12)
    expect(hi).toBeGreaterThan(0.035)
    expect(lo).toBeLessThan(-0.035)
  })

  it('climb is flat for 5 min, 6.5% until 60% of the activity, then -5%', () => {
    const g = gradeFunction('climb', 1000, constant)
    expect(g(0, 0)).toBe(0)
    expect(g(0, 299)).toBe(0)
    expect(g(0, 300)).toBeGreaterThan(0.06)
    expect(g(0, 300)).toBeLessThan(0.07)
    expect(g(0, 599)).toBeGreaterThan(0.06)
    expect(g(0, 599)).toBeLessThan(0.07)
    expect(g(0, 600)).toBe(-0.05)
  })
})
