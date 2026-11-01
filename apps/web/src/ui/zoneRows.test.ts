import { describe, expect, it } from 'vitest'
import { zonesFor } from '@rca/core/zones'
import type { ZoneSet } from '@rca/core/zones'
import { maxHeartRateBasis, sourceText, zoneRange, zoneTable } from './zoneRows'

function setOf(partial: Partial<ZoneSet> & Pick<ZoneSet, 'measure' | 'reference'>): ZoneSet {
  return {
    sport: 'ride',
    source: 'estimated',
    citation: 'A scheme',
    estimatedFrom: ['ride'],
    maxHeartRateFrom: null,
    asOfMs: null,
    floorS: null,
    fromHighest: false,
    zones: zonesFor(partial.measure, partial.reference),
    ...partial,
  }
}

describe('zoneRange', () => {
  it('names the open ends of power and heart rate zones, and spans the rest', () => {
    const power = zonesFor('power', 200)
    expect(zoneRange('power', power[0]!, 'metric')).toBe('Under 110 W')
    expect(zoneRange('power', power[3]!, 'metric')).toBe('180–209 W')
    expect(zoneRange('power', power[6]!, 'metric')).toBe('300 W or more')
    const heart = zonesFor('heartRate', 190)
    expect(zoneRange('heartRate', heart[4]!, 'metric')).toBe('171 bpm or more')
  })

  it('writes a range that agrees with where a reading is counted, whatever the cut rounds to', () => {
    // 0.6 of 219 bpm is 131.4: 131 bpm is below the cut, so the zone above is written from 132.
    const heart = zonesFor('heartRate', 219)
    expect(zoneRange('heartRate', heart[0]!, 'metric')).toBe('Under 132 bpm')
    expect(zoneRange('heartRate', heart[1]!, 'metric')).toBe('132–153 bpm')
    // Every whole number from 0 to 250 is in exactly the zone whose written range holds it.
    for (let bpm = 0; bpm <= 250; bpm++) {
      const counted = heart.findIndex(
        (zone) => bpm >= zone.low && (zone.high === null || bpm < zone.high),
      )
      const written = heart.filter((zone) => {
        const text = zoneRange('heartRate', zone, 'metric')
        const numbers = (text.match(/\d+/g) ?? []).map(Number)
        if (text.startsWith('Under')) return bpm < numbers[0]!
        if (text.endsWith('or more')) return bpm >= numbers[0]!
        return bpm >= numbers[0]! && bpm <= numbers[1]!
      })
      expect(written.map((zone) => zone.level)).toEqual([counted + 1])
    }
  })

  it('writes run zones as paces, the fast edge first', () => {
    const pace = zonesFor('pace', 1000 / 300)
    expect(zoneRange('pace', pace[0]!, 'metric')).toBe('Slower than 6:25 /km')
    expect(zoneRange('pace', pace[3]!, 'metric')).toBe('4:55–5:17 /km')
    expect(zoneRange('pace', pace[4]!, 'metric')).toBe('4:54 /km or faster')
  })

  it('writes paces per mile in imperial units', () => {
    const pace = zonesFor('pace', 1609.344 / 480)
    expect(zoneRange('pace', pace[4]!, 'imperial')).toBe('7:53 /mi or faster')
  })
})

describe('zone ranges do not repeat a shared edge', () => {
  it('starts each zone one past where the zone below it ends, in whole watts and beats', () => {
    for (const [measure, reference] of [
      ['power', 187.5],
      ['heartRate', 183],
    ] as const) {
      const text = zonesFor(measure, reference).map((zone) => zoneRange(measure, zone, 'metric'))
      const numbers = text.map((line) => line.match(/\d+/g)!.map(Number))
      // 'Under 103', '103–140', ... : each zone's first number follows the previous zone's last.
      numbers
        .slice(1)
        .forEach((own, i) => expect(own[0]).toBe(numbers[i]!.at(-1)! + (i === 0 ? 0 : 1)))
    }
  })

  it('ends a pace zone on a pace of its own, and gives the fast edge to the zone above', () => {
    const lines = zonesFor('pace', 1000 / 300).map((zone) => zoneRange('pace', zone, 'metric'))
    expect(lines).toEqual([
      'Slower than 6:25 /km',
      '5:46–6:25 /km',
      '5:18–5:45 /km',
      '4:55–5:17 /km',
      '4:54 /km or faster',
    ])
  })
})

describe('zoneTable', () => {
  it('titles a table by sport and measure, with its source and reference', () => {
    const table = zoneTable(setOf({ measure: 'power', reference: 250 }), 'metric')
    expect(table.title).toBe('Ride power zones')
    expect(table.detail).toBe('Threshold power: 250 W, from your rides')
    expect(table.columns).toEqual(['Zone', 'Name', 'Range'])
    expect(table.rows).toHaveLength(7)
    expect(table.rows[0]).toEqual(['1', 'Active recovery', 'Under 140 W'])
  })

  it('gives an estimated threshold its figure and its source, with no note on a newer fit', () => {
    const set = setOf({ sport: 'run', measure: 'pace', reference: 3.5, estimatedFrom: ['run'] })
    expect(zoneTable(set, 'metric').detail).toBe('Threshold pace: 4:46 /km, from your runs')
  })

  it('says an entered reference was entered', () => {
    const set = setOf({ sport: 'run', measure: 'heartRate', reference: 188, source: 'entered' })
    expect(sourceText(set)).toBe('You entered')
    expect(zoneTable(set, 'metric').detail).toBe('Max heart rate: 188 bpm, entered by you')
    expect(zoneTable(set, 'metric').title).toBe('Run heart rate zones')
  })

  it('says a heart rate worked out from both sports rests on both', () => {
    const set = setOf({ measure: 'heartRate', reference: 183, estimatedFrom: ['run', 'ride'] })
    expect(sourceText(set)).toBe('From your runs and rides')
  })

  it('says a run estimate comes from the runs', () => {
    expect(
      sourceText(setOf({ sport: 'run', measure: 'pace', reference: 3.5, estimatedFrom: ['run'] })),
    ).toBe('From your runs')
  })
})

describe('the source and basis of an estimated zone set', () => {
  const SEPTEMBER_2021 = new Date(2021, 8, 15, 12).getTime()
  const MARCH_2025 = new Date(2025, 2, 15, 12).getTime()

  it('dates a pace or power that comes from an older fit', () => {
    const set = setOf({ sport: 'run', measure: 'pace', reference: 3.5, estimatedFrom: ['run'] })
    expect(sourceText({ ...set, asOfMs: MARCH_2025 })).toBe('From your runs up to Mar 2025')
    expect(sourceText(set)).toBe('From your runs')
    expect(zoneTable({ ...set, asOfMs: MARCH_2025 }, 'metric').detail).toBe(
      'Threshold pace: 4:46 /km, set in Mar 2025',
    )
  })

  it('dates a pace or power cut from the floor by the effort that set it, and names the effort', () => {
    const asOfMs = new Date(2025, 2, 15, 12).getTime()
    const set = setOf({
      sport: 'run',
      measure: 'pace',
      reference: 3.5,
      estimatedFrom: ['run'],
      asOfMs,
      floorS: 1800,
    })
    expect(sourceText(set)).toBe('From your best 30 min on 15 Mar 2025')
    expect(zoneTable(set, 'metric').detail).toBe(
      'Threshold pace: 4:46 /km, from your best 30 min on 15 Mar 2025',
    )
    expect(sourceText({ ...set, floorS: 1200 })).toBe('From your best 20 min on 15 Mar 2025')
  })

  it('says a max heart rate cut from the highest on file is that, and can still be corrected', () => {
    const set = setOf({
      sport: 'run',
      measure: 'heartRate',
      reference: 176,
      estimatedFrom: ['run'],
      fromHighest: true,
      maxHeartRateFrom: { bpm: 176, days: 5, sinceMs: 0 },
    })
    expect(maxHeartRateBasis(set)).toBe('176 bpm, your highest on file')
    const table = zoneTable(set, 'metric')
    expect(table.detail).toBe('Max heart rate: 176 bpm, your highest on file')
    expect(table.askable).toBe(true)
  })

  it('gives an estimated max heart rate as its figure alone, whatever days reached it', () => {
    const own = setOf({
      sport: 'run',
      measure: 'heartRate',
      reference: 185.6,
      estimatedFrom: ['run'],
      maxHeartRateFrom: { bpm: 185.6, days: 4, sinceMs: SEPTEMBER_2021 },
    })
    expect(maxHeartRateBasis(own)).toBe('186 bpm')
    expect(zoneTable(own, 'metric')).toMatchObject({
      detail: 'Max heart rate: 186 bpm',
      askable: true,
    })
    const thin = { ...own, maxHeartRateFrom: { bpm: 185.6, days: 1, sinceMs: SEPTEMBER_2021 } }
    expect(maxHeartRateBasis(thin)).toBe('186 bpm')
  })

  it("says a sport's reference is worked out from the other sport's maximum", () => {
    const ride = setOf({
      sport: 'ride',
      measure: 'heartRate',
      reference: 180,
      estimatedFrom: ['run'],
    })
    expect(maxHeartRateBasis(ride)).toBe('180 bpm, 6 bpm below your running maximum')
    const run = setOf({
      sport: 'run',
      measure: 'heartRate',
      reference: 188,
      estimatedFrom: ['ride'],
    })
    expect(maxHeartRateBasis(run)).toBe('188 bpm, your cycling maximum')
  })

  it('has no basis for an entered reference or for a pace or power', () => {
    expect(
      maxHeartRateBasis(
        setOf({ measure: 'heartRate', reference: 188, source: 'entered', estimatedFrom: [] }),
      ),
    ).toBeNull()
    expect(maxHeartRateBasis(setOf({ measure: 'power', reference: 250 }))).toBeNull()
  })
})
