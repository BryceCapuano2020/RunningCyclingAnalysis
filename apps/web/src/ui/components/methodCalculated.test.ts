import { describe, expect, it } from 'vitest'
import {
  CALCULATION_ITEMS,
  STATE_COPY,
  STATE_ORDER,
  type CalculationState,
} from './methodCalculated'
import type { SectionId } from '../pages/sportSections'

const namesIn = (state: CalculationState) =>
  CALCULATION_ITEMS.filter((item) => item.state === state).map((item) => item.name)

describe('What is calculated', () => {
  it('names its three states as the page lists them', () => {
    expect(STATE_ORDER.map((state) => STATE_COPY[state].title)).toEqual([
      'Calculated by this app',
      'Read from your files',
      'Not available from activity files',
    ])
  })

  it('lists every feature the app shows today in the state it belongs to', () => {
    const calculated = namesIn('calculated').join(' | ')
    for (const feature of [
      /Balance and levels/,
      /Thresholds/,
      /Best efforts and curves/,
      /Race predictions/,
      /Best efforts over time/,
      /Whether a change is a change/,
      /same heart rate/,
      /Level target/,
      /Grade by duration/,
      /stand out/,
      /Virtual power/,
      /Splits/,
      /The timeline in detail/,
      /Time in zones/,
      /Heart-rate set-aside/,
      /Late in long sessions/,
      /reps held up/,
      /Weekly hours by sport/,
      /Runs at walking pace/,
      /Dated settings and estimated zones/,
      /Equivalence across sports/,
    ]) {
      expect(calculated).toMatch(feature)
    }
    expect(namesIn('read').join(' | ')).toMatch(
      /Heart rate.*Power from a power meter.*Timelines and laps/,
    )
  })

  it('has an entry for every section a sport page can show', () => {
    // Typed by SectionId, so a new section fails to compile here until it is listed.
    const entryFor: Record<SectionId, RegExp> = {
      bestEfforts: /Best efforts and curves/,
      racePredictions: /Race predictions/,
      bestsOverTime: /Best efforts over time/,
      sameHeartRate: /same heart rate/,
      lateInEffort: /Late in long sessions/,
      timeInZones: /Time in zones/,
      standOut: /stand out/i,
      evidence: /Best efforts and curves/,
    }
    const calculated = namesIn('calculated')
    for (const id of Object.keys(entryFor) as SectionId[]) {
      expect(calculated.some((name) => entryFor[id].test(name))).toBe(true)
    }
  })

  it('puts readiness scores and vendor tests where they cannot be worked out', () => {
    const unavailable = CALCULATION_ITEMS.filter((item) => item.state === 'unavailable')
    expect(unavailable.map((item) => item.name)).toEqual([
      'Readiness and recovery scores',
      'Vendor tests such as 4DP',
      'Lab measures such as lactate',
    ])
    expect(unavailable[0]?.line).toMatch(/sleep, heart-rate variability and resting heart rate/)
  })

  it('says what the figures come from, and where a file’s own values are the device’s', () => {
    expect(STATE_COPY.calculated.line).toMatch(/year of birth, sex and weight/)
    const read = CALCULATION_ITEMS.find((item) => item.name.startsWith('Sport, start time'))
    expect(read?.line).toMatch(/activity type/)
    expect(read?.line).toMatch(/GPS positions with bad fixes dropped/)
    const race = CALCULATION_ITEMS.find((item) => item.name === 'Race predictions')
    expect(race?.line).toMatch(/weekly running distance/)
  })

  it('gives each state at least one item, and each name once', () => {
    for (const state of STATE_ORDER) expect(namesIn(state).length).toBeGreaterThan(0)
    const names = CALCULATION_ITEMS.map((item) => item.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('keeps each line short and plain: one or two sentences, no hedge, none of the words the app avoids', () => {
    for (const item of CALCULATION_ITEMS) {
      expect(item.line.length).toBeLessThanOrEqual(170)
      expect(item.line.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(2)
      expect(item.line).toMatch(/\.$/)
    }
    const copy = CALCULATION_ITEMS.map((item) => `${item.name} ${item.line}`).join(' ')
    expect(copy).not.toMatch(
      /limiter|weak|strength|holding you back|ahead of|may be|might|approximately|disclaimer/i,
    )
  })

  it('takes the figures it quotes from the code: the headline length and the threshold fit', () => {
    const balance = CALCULATION_ITEMS.find((item) => item.name === 'Balance and levels')
    expect(balance?.line).toContain('best 20 min')
    const threshold = CALCULATION_ITEMS.find(
      (item) => item.name === 'Thresholds and their range',
    )
    expect(threshold?.line).toContain('best 3 to 20 min efforts')
  })
})
