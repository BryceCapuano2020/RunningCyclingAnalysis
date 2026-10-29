import { describe, expect, it } from 'vitest'
import { sampleDataset } from '../synthetic'
import type { ActivityDigest, AthleteSettings, Sport } from '../types'
import { digestActivity } from './digestActivity'
import { estimatedStanding } from './estimatedRide'
import { massesOf } from './masses'
import {
  centralWkgFromWatts,
  fitBikeModelOver,
  pointWkg,
  rideWattsAt,
  runCentralWkg,
} from './rideCurves'

const settings: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const samples = sampleDataset().activities.map((activity) => digestActivity(activity))
const sampleOf = (sport: Sport): ActivityDigest => {
  const found = samples.find((digest) => digest.sport === sport)
  if (found === undefined) throw new Error(`The sample has no ${sport}`)
  return found
}

const masses = massesOf(settings)
const model = fitBikeModelOver(samples, masses).model
const holds = estimatedStanding(null)

describe('pointWkg', () => {
  it('prices a run point at the prior-mean economy, with no watts', () => {
    const run = sampleOf('run')
    for (const point of run.curve.slice(0, 6)) {
      const priced = pointWkg(point, run, masses, model, holds)
      expect(priced.wkg).toBe(runCentralWkg(point))
      expect(priced.watts).toBeNaN()
      expect(priced.alone).toBe(false)
    }
  })

  it('prices a ride point from its watts and the body mass of its day', () => {
    const ride = sampleOf('ride')
    for (const point of ride.curve.slice(0, 6)) {
      const watts = rideWattsAt(point, masses.totalKg(ride), model)
      const priced = pointWkg(point, ride, masses, model, holds)
      expect(priced.watts).toBe(watts)
      expect(priced.wkg).toBe(centralWkgFromWatts(watts, masses.bodyKg(ride)))
      expect(priced.alone).toBe(false)
    }
  })

  it('leaves a ride point the standing drops as NaN in both units', () => {
    const ride = sampleOf('ride')
    const point = ride.curve[0]!
    const priced = pointWkg(point, ride, masses, model, () => 'drops')
    expect(priced.watts).toBeNaN()
    expect(priced.wkg).toBeNaN()
  })

  it('reports a point that stands at its own duration only', () => {
    const ride = sampleOf('ride')
    const priced = pointWkg(ride.curve[0]!, ride, masses, model, () => 'stands')
    expect(priced.alone).toBe(true)
    expect(priced.wkg).toBeGreaterThan(0)
  })
})
