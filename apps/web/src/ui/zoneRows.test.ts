import { describe, expect, it } from 'vitest'
import { zonesFor } from '@rca/core/zones'
import type { ZoneSet } from '@rca/core/zones'
import { sourceText, zoneRange, zoneTable } from './zoneRows'

function setOf(partial: Partial<ZoneSet> & Pick<ZoneSet, 'measure' | 'reference'>): ZoneSet {
  return {
    sport: 'ride',
    source: 'estimated',
    citation: 'A scheme',
    zones: zonesFor(partial.measure, partial.reference),
    ...partial,
  }
}

describe('zoneRange', () => {
  it('names the open ends of power and heart rate zones, and spans the rest', () => {
    const power = zonesFor('power', 200)
    expect(zoneRange('power', power[0]!, 'metric')).toBe('Under 110 W')
    expect(zoneRange('power', power[3]!, 'metric')).toBe('180–210 W')
    expect(zoneRange('power', power[6]!, 'metric')).toBe('Over 300 W')
    const heart = zonesFor('heartRate', 190)
    expect(zoneRange('heartRate', heart[4]!, 'metric')).toBe('Over 171 bpm')
  })

  it('writes run zones as paces, the fast edge first', () => {
    const pace = zonesFor('pace', 1000 / 300)
    expect(zoneRange('pace', pace[0]!, 'metric')).toBe('Slower than 6:27 /km')
    expect(zoneRange('pace', pace[3]!, 'metric')).toBe('4:57–5:18 /km')
    expect(zoneRange('pace', pace[4]!, 'metric')).toBe('Faster than 4:57 /km')
  })

  it('writes paces per mile in imperial units', () => {
    const pace = zonesFor('pace', 1609.344 / 480)
    expect(zoneRange('pace', pace[4]!, 'imperial')).toBe('Faster than 7:55 /mi')
  })
})

describe('zoneTable', () => {
  it('titles a table by sport and measure, with its source and reference', () => {
    const table = zoneTable(setOf({ measure: 'power', reference: 250 }), 'metric')
    expect(table.title).toBe('Ride power zones')
    expect(table.detail).toBe('From your rides: threshold power 250 W')
    expect(table.columns).toEqual(['Zone', 'Name', 'Range'])
    expect(table.rows).toHaveLength(7)
    expect(table.rows[0]).toEqual(['1', 'Active recovery', 'Under 138 W'])
  })

  it('says an entered reference was entered', () => {
    const set = setOf({ sport: 'run', measure: 'heartRate', reference: 188, source: 'entered' })
    expect(sourceText(set)).toBe('You entered')
    expect(zoneTable(set, 'metric').detail).toBe('You entered: max heart rate 188 bpm')
    expect(zoneTable(set, 'metric').title).toBe('Run heart rate zones')
  })

  it('says a run estimate comes from the runs', () => {
    expect(sourceText(setOf({ sport: 'run', measure: 'pace', reference: 3.5 }))).toBe(
      'From your runs',
    )
  })
})
