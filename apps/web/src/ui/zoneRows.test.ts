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
    expect(table.detail).toBe('From your rides: threshold power 250 W')
    expect(table.columns).toEqual(['Zone', 'Name', 'Range'])
    expect(table.rows).toHaveLength(7)
    expect(table.rows[0]).toEqual(['1', 'Active recovery', 'Under 140 W'])
  })

  it('says an entered reference was entered', () => {
    const set = setOf({ sport: 'run', measure: 'heartRate', reference: 188, source: 'entered' })
    expect(sourceText(set)).toBe('You entered')
    expect(zoneTable(set, 'metric').detail).toBe('You entered: max heart rate 188 bpm')
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
  const MARCH_2023 = new Date(2023, 2, 15, 12).getTime()
  const MARCH_2025 = new Date(2025, 2, 15, 12).getTime()

  it('dates a pace or power that comes from an older fit', () => {
    const set = setOf({ sport: 'run', measure: 'pace', reference: 3.5, estimatedFrom: ['run'] })
    expect(sourceText({ ...set, asOfMs: MARCH_2025 })).toBe('From your runs to Mar 2025')
    expect(sourceText(set)).toBe('From your runs')
  })

  it('says how many separate days reached an estimated max heart rate, and since when', () => {
    const own = setOf({
      sport: 'run',
      measure: 'heartRate',
      reference: 200.6,
      estimatedFrom: ['run'],
      maxHeartRateFrom: { bpm: 200.6, days: 3, sinceMs: MARCH_2023 },
    })
    expect(maxHeartRateBasis(own)).toBe(
      '201 bpm, the highest you reached on 3 separate days since Mar 2023',
    )
    expect(zoneTable(own, 'metric')).toMatchObject({
      detail: 'Max heart rate: 201 bpm, the highest you reached on 3 separate days since Mar 2023',
      askable: true,
    })
    const thin = { ...own, maxHeartRateFrom: { bpm: 200.6, days: 1, sinceMs: MARCH_2023 } }
    expect(maxHeartRateBasis(thin)).toBe(
      '201 bpm, the highest you reached, on a single day since Mar 2023',
    )
  })

  it("says a sport's reference is worked out from the other sport's maximum", () => {
    const ride = setOf({
      sport: 'ride',
      measure: 'heartRate',
      reference: 195,
      estimatedFrom: ['run'],
    })
    expect(maxHeartRateBasis(ride)).toBe('195 bpm, 6 bpm below your running maximum')
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
