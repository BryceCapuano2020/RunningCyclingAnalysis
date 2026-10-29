import { describe, expect, it } from 'vitest'
import { SPORT_ADAPTERS } from './adapters'
import { withBlocks } from '../digest/test/sameHeartRateFixture'

describe('SPORT_ADAPTERS', () => {
  const run = SPORT_ADAPTERS.run
  const ride = SPORT_ADAPTERS.ride

  it('names each sport and its output', () => {
    expect([run.noun, run.nounPlural, run.outputName]).toEqual(['run', 'runs', 'pace'])
    expect([ride.noun, ride.nounPlural, ride.outputName]).toEqual(['ride', 'rides', 'power'])
    expect([run.outputDistribution, ride.outputDistribution]).toEqual(['speed', 'power'])
  })

  it("says a run's output as pace and a ride's as watts", () => {
    expect(run.format(2.8, 'metric')).toBe('5:57 /km')
    expect(run.format(2.8, 'imperial')).toBe('9:35 /mi')
    expect(ride.format(212.4, 'metric')).toBe('212 W')
  })

  it('says how far apart two outputs are, with the word for the side', () => {
    // 1000 / 2.8 = 357.1 s/km and 1000 / 2.9 = 344.8 s/km; per mile 574.8 and 555.0 s.
    expect(run.difference(2.8, 2.9, 'metric')).toEqual({ amount: '12 s/km', word: 'faster' })
    expect(run.difference(2.9, 2.8, 'metric')).toEqual({ amount: '12 s/km', word: 'slower' })
    expect(run.difference(2.8, 2.9, 'imperial')).toEqual({ amount: '20 s/mi', word: 'faster' })
    expect(ride.difference(200, 212, 'metric')).toEqual({ amount: '12 W', word: 'more' })
    expect(ride.difference(212, 200, 'imperial')).toEqual({ amount: '12 W', word: 'less' })
  })

  it('reads outdoor runs and measured rides only, and asks for a change worth saying', () => {
    const outdoorRun = withBlocks('run', 'r', 0, [])
    const indoorRun = withBlocks('run', 'r', 0, [], { indoor: true })
    const measured = withBlocks('ride', 'b', 0, [])
    const virtual = withBlocks('ride', 'b', 0, [], { powerSource: 'virtual' })
    expect([run.usable(outdoorRun), run.usable(indoorRun)]).toEqual([true, false])
    expect([ride.usable(measured), ride.usable(virtual)]).toEqual([true, false])
    expect(run.minRelativeChange).toBe(0.025)
    expect(ride.minRelativeChange).toBe(0.03)
  })
})
