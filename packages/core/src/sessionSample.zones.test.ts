import './test/warmSample'
import { describe, expect, it } from 'vitest'
import { AnalysisSession } from './session'
import { effortSplit } from './zones'

/**
 * The sample's running is mostly easy by pace and by heart rate alike. The audit found pace zones saying 75% easy
 * while heart-rate zones said 9% (an easy pace drawn at 62% of critical speed beside a heart rate at 71% of maximum).
 */
describe('the sample athlete’s zones', () => {
  const { timeInZones } = new AnalysisSession().loadSample({ massKg: 75, bikeMassKg: 9 })
  const easy = (measure: 'pace' | 'heartRate') => {
    const time = timeInZones.current.run.find((row) => row.measure === measure)!
    return effortSplit(time).easy
  }

  it('has easy running in both its heart-rate zones and its pace zones, within a quarter of each other', () => {
    expect(easy('pace')).toBeGreaterThan(0.8)
    expect(easy('heartRate')).toBeGreaterThan(0.6)
    expect(Math.abs(easy('pace') - easy('heartRate'))).toBeLessThan(0.25)
  })
})
