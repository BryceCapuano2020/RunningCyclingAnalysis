// @vitest-environment jsdom
import type { RacePrediction } from '@rca/core/predict'
import type { Period } from '@rca/core/period'
import type { AthleteSettings, Sport } from '@rca/core/types'
import { describe, expect, it } from 'vitest'
import { makeResult, makeRideThreshold } from '../ui/components/test/fixtures'
import type { GradeOutcome } from '../ui/grades'
import type { LiftTileModel } from '../ui/lift/liftTile'
import { threshold } from '../ui/records'
import { triangleViewOf } from '../ui/triangleSports'
import { buildShareCard } from './cardModel'
import type { CardFigures } from './cardModel'

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const ALL_TIME: Period = { choice: 'all', startMs: null, endMs: null, days: null, fellBack: false }
const NO_GRADES: Record<Sport, GradeOutcome | null> = { run: null, ride: null }

/** A synthetic ride threshold in the range of a trained 75 kg rider. */
const RESULT = makeResult({ rideThreshold: makeRideThreshold(17) })
/** The functional threshold power Balance's row shows for it. */
const FTP = threshold(RESULT, 'ride', SETTINGS.massKg, 'metric')!
/** A synthetic half marathon of 1:42:30, with its likely span. */
const HALF: RacePrediction = {
  distanceM: 21_097.5,
  seconds: 6150,
  low: 5950,
  high: 6350,
  floored: false,
  methods: [],
}
/** A synthetic lifting row with the big three's total. */
const LIFT: LiftTileModel = {
  heading: 'Big three total',
  figure: { number: '380', unit: 'kg' },
  rows: [],
}

function cardWith(figures: CardFigures) {
  return buildShareCard(
    RESULT,
    SETTINGS,
    'metric',
    ALL_TIME,
    false,
    true,
    null,
    NO_GRADES,
    null,
    {},
    triangleViewOf(NO_GRADES),
    figures,
  )
}

describe('the share card’s figures', () => {
  it('leads with the half marathon when the run’s row does, then the threshold power and the big three total', () => {
    const card = cardWith({ half: HALF, lift: LIFT })
    expect(card?.heroes).toEqual([
      {
        sport: 'run',
        label: 'Half-marathon',
        figure: { number: '1:42:30', unit: '' },
        sub: null,
      },
      {
        sport: 'ride',
        label: 'Functional threshold power',
        figure: { number: FTP.number, unit: 'W' },
        sub: FTP.sub,
      },
      { sport: 'lift', label: 'Big three total', figure: { number: '380', unit: 'kg' }, sub: null },
    ])
    // The fixture is a plausible rider, so a preview drawn from it reads as one.
    expect(Number(FTP.number)).toBeGreaterThanOrEqual(220)
    expect(Number(FTP.number)).toBeLessThanOrEqual(300)
  })

  it('keeps the run threshold without a half marathon, and names the heaviest lift when that is the row’s figure', () => {
    const heaviest: LiftTileModel = { ...LIFT, heading: 'Deadlift, projected 1RM' }
    const card = cardWith({ half: null, lift: heaviest })
    expect(card?.heroes.map((hero) => [hero.sport, hero.label])).toEqual([
      ['run', 'Run threshold'],
      ['ride', 'Functional threshold power'],
      ['lift', 'Deadlift, projected 1RM'],
    ])
  })

  it('leaves lifting off while its row has no figure, so the card keeps two', () => {
    const none: LiftTileModel = { ...LIFT, figure: null }
    for (const lift of [none, null]) {
      expect(cardWith({ half: null, lift })?.heroes.map((hero) => hero.sport)).toEqual([
        'run',
        'ride',
      ])
    }
  })
})
