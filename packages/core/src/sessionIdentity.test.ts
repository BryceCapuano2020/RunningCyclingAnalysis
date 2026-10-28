import { describe, expect, it } from 'vitest'
import { AnalysisSession } from './session'
import type { Measurement } from './athlete'
import type { PeriodChoice } from './period'
import type { AthleteSettings } from './types'
import { copiedLibrary } from './test/libraryFixture'
import { stateHashes } from './test/stateHashes'

/**
 * The session state for a library of 400 copied activities, ten a week from 4 January 2021, under four
 * periods, first taken from main at 379c9458, before the draws were sorted by their bits, the trend and
 * same-heart-rate windows were found by search, and a summary was made once. A change that only makes
 * the analysis faster must leave every hash as it is. A change that means to alter the analysis copies
 * the received hashes from this test's failure, and says in its description which field moved and why.
 *
 * Periods and dated body masses are counted in local days, so the state is taken in four settings: one
 * body mass in UTC, then three dated masses (each ride priced at its own weight) in UTC, in Los Angeles
 * and in Auckland. The masses change inside the library's span, and both zones change clocks inside it,
 * which moves an activity into another local day. The custom range holds the Los Angeles change of 14
 * March. The zone is set in the test, which the forked workers apply to dates, and checked there.
 */
const FIXED: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const mass = (value: number, from: string): Measurement => ({ kind: 'massKg', value, from })
const DATED: AthleteSettings = {
  ...FIXED,
  measurements: [mass(82, '2021-01-01'), mass(76, '2021-04-01'), mass(71, '2021-08-01')],
}
const CHOICES: PeriodChoice[] = ['default', 'all', 42, { from: '2021-03-10', to: '2021-03-20' }]

interface Setting {
  label: string
  zone: string
  /** Minutes behind UTC in July 2021, to check that the zone took effect. */
  julyOffset: number
  settings: AthleteSettings
}

const SETTINGS: Setting[] = [
  { label: 'fixed in UTC', zone: 'UTC', julyOffset: 0, settings: FIXED },
  { label: 'dated in UTC', zone: 'UTC', julyOffset: 0, settings: DATED },
  { label: 'dated in Los Angeles', zone: 'America/Los_Angeles', julyOffset: 420, settings: DATED },
  { label: 'dated in Auckland', zone: 'Pacific/Auckland', julyOffset: -720, settings: DATED },
]

const PINNED: Record<string, Record<string, string>> = {
  'fixed in UTC': {
    '"default"/result': 'a48bcaf8b2eec440',
    '"default"/trend': 'b719562695332e32',
    '"default"/effortTrends': '3b4422fef9957039',
    '"default"/sameHeartRate': '784622306d69066e',
    '"default"/lateEvidence': '89f961a046bc4693',
    '"default"/previous': '655696e0b52415be',
    '"default"/records': 'ddd2a6493f7bb9da',
    '"default"/library': 'a4aaf3b846398647',
    '"default"/period': '6f360d1647ca0139',
    '"all"/result': '7ed39a2204514f4d',
    '"all"/trend': '67f692c560987411',
    '"all"/effortTrends': '80e1034e00d15dbd',
    '"all"/sameHeartRate': '93dc5c7e232d0afe',
    '"all"/lateEvidence': '498e9e34783fbaa8',
    '"all"/previous': '74234e98afe7498f',
    '"all"/records': 'ddd2a6493f7bb9da',
    '"all"/library': 'a4aaf3b846398647',
    '"all"/period': '47579e1a1fbdd02b',
    '42/result': '61b28ec712fadc90',
    '42/trend': '54e058d8e4bdedcb',
    '42/effortTrends': '94546c1ab54f801d',
    '42/sameHeartRate': 'd9735a4225952df0',
    '42/lateEvidence': '38d3d958b4687a74',
    '42/previous': 'bf5069e8ac665928',
    '42/records': 'ddd2a6493f7bb9da',
    '42/library': 'a4aaf3b846398647',
    '42/period': 'f52586cd25d95522',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': '4a60c2252f9f24d6',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': 'c0ebd00cad64665b',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '04a14d73338881d4',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': '929495a9e564b189',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '1f59cbfa6c8715e8',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': 'f3b3def40fd38c7d',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': 'ddd2a6493f7bb9da',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': 'a4aaf3b846398647',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '96d95e57a4633ca0',
  },
  'dated in UTC': {
    '"default"/result': '3b8691b6e0f884f2',
    '"default"/trend': '91fa83cbadee829f',
    '"default"/effortTrends': 'e2b1f5240f3dc980',
    '"default"/sameHeartRate': '784622306d69066e',
    '"default"/lateEvidence': '89f961a046bc4693',
    '"default"/previous': 'e0b3258ab88047ce',
    '"default"/records': '2e6b44bf83e3211c',
    '"default"/library': '3dd1ddf1dd87a8c1',
    '"default"/period': '6f360d1647ca0139',
    '"all"/result': 'de886770677767c5',
    '"all"/trend': '5893b16c5b5cd288',
    '"all"/effortTrends': '64f439232bd29bff',
    '"all"/sameHeartRate': '93dc5c7e232d0afe',
    '"all"/lateEvidence': '498e9e34783fbaa8',
    '"all"/previous': '74234e98afe7498f',
    '"all"/records': '2e6b44bf83e3211c',
    '"all"/library': '3dd1ddf1dd87a8c1',
    '"all"/period': '47579e1a1fbdd02b',
    '42/result': '09538f363ddea9d8',
    '42/trend': 'a8ea041921cea373',
    '42/effortTrends': 'e57a7f08419005bf',
    '42/sameHeartRate': 'd9735a4225952df0',
    '42/lateEvidence': '38d3d958b4687a74',
    '42/previous': '0f2ffbe29f8d487b',
    '42/records': '2e6b44bf83e3211c',
    '42/library': '3dd1ddf1dd87a8c1',
    '42/period': 'f52586cd25d95522',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': 'ce158034fe9d0e9b',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': 'd7f72a4f5918dbd6',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '99415c86ef44e359',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': '929495a9e564b189',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '1f59cbfa6c8715e8',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '9e7f5506d1f915e6',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '2e6b44bf83e3211c',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '3dd1ddf1dd87a8c1',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '96d95e57a4633ca0',
  },
  'dated in Los Angeles': {
    '"default"/result': '3b8691b6e0f884f2',
    '"default"/trend': '91fa83cbadee829f',
    '"default"/effortTrends': 'e2b1f5240f3dc980',
    '"default"/sameHeartRate': '784622306d69066e',
    '"default"/lateEvidence': '89f961a046bc4693',
    '"default"/previous': 'e0b3258ab88047ce',
    '"default"/records': '2e6b44bf83e3211c',
    '"default"/library': '3dd1ddf1dd87a8c1',
    '"default"/period': '7cbdf77a690f6297',
    '"all"/result': 'de886770677767c5',
    '"all"/trend': '5893b16c5b5cd288',
    '"all"/effortTrends': '64f439232bd29bff',
    '"all"/sameHeartRate': '93dc5c7e232d0afe',
    '"all"/lateEvidence': '498e9e34783fbaa8',
    '"all"/previous': '74234e98afe7498f',
    '"all"/records': '2e6b44bf83e3211c',
    '"all"/library': '3dd1ddf1dd87a8c1',
    '"all"/period': 'b4022d2b20f6cb24',
    '42/result': '09538f363ddea9d8',
    '42/trend': 'a8ea041921cea373',
    '42/effortTrends': 'e57a7f08419005bf',
    '42/sameHeartRate': 'd9735a4225952df0',
    '42/lateEvidence': '38d3d958b4687a74',
    '42/previous': '0f2ffbe29f8d487b',
    '42/records': '2e6b44bf83e3211c',
    '42/library': '3dd1ddf1dd87a8c1',
    '42/period': 'ee8d1f6b756898a2',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': '436b6ff032a95353',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': 'd7f72a4f5918dbd6',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '99415c86ef44e359',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': '929495a9e564b189',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '52ba56c96d62fc7e',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '21449b592650290f',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '2e6b44bf83e3211c',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '3dd1ddf1dd87a8c1',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '7de40011ebc2b6a9',
  },
  'dated in Auckland': {
    '"default"/result': '3b8691b6e0f884f2',
    '"default"/trend': 'b5023db1f0ac6180',
    '"default"/effortTrends': 'e487a7179dc9e18b',
    '"default"/sameHeartRate': '4ff82c0d7332e7c3',
    '"default"/lateEvidence': '89f961a046bc4693',
    '"default"/previous': 'e0b3258ab88047ce',
    '"default"/records': '2e6b44bf83e3211c',
    '"default"/library': '5363f61970f87a1c',
    '"default"/period': 'c102373861471840',
    '"all"/result': 'c1a5cf4413571fd4',
    '"all"/trend': 'c2cdeb6786bfc717',
    '"all"/effortTrends': '01d4ee8d84f2f486',
    '"all"/sameHeartRate': '93dc5c7e232d0afe',
    '"all"/lateEvidence': '498e9e34783fbaa8',
    '"all"/previous': '74234e98afe7498f',
    '"all"/records': '2e6b44bf83e3211c',
    '"all"/library': '5363f61970f87a1c',
    '"all"/period': '4e2b3f99b79165f0',
    '42/result': '09538f363ddea9d8',
    '42/trend': '3ad48972fa2d6d03',
    '42/effortTrends': '469379a8a87249f9',
    '42/sameHeartRate': '530d52d0e56eaf4d',
    '42/lateEvidence': '38d3d958b4687a74',
    '42/previous': '0f2ffbe29f8d487b',
    '42/records': '2e6b44bf83e3211c',
    '42/library': '5363f61970f87a1c',
    '42/period': '8f564f063b3bbb04',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': '10e5e3b80dfeddb7',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': 'd7f72a4f5918dbd6',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '99415c86ef44e359',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': '929495a9e564b189',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '642c86fde2c24962',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': 'c304b7331da7c4cc',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '2e6b44bf83e3211c',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '5363f61970f87a1c',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': 'aa4c803ea5ad72ed',
  },
}

type Env = { env: Record<string, string | undefined> }
const env = (globalThis as { process?: Env }).process!.env

/** Runs with the time zone set, and puts it back. */
async function inZone<T>(zone: string, run: () => Promise<T> | T): Promise<T> {
  const saved = env.TZ
  env.TZ = zone
  try {
    return await run()
  } finally {
    if (saved === undefined) delete env.TZ
    else env.TZ = saved
  }
}

describe('session state', () => {
  const library = copiedLibrary(400)

  it.each(SETTINGS)(
    'is byte for byte the pinned state of 400 activities, $label',
    ({ label, zone, julyOffset, settings }) =>
      inZone(zone, async () => {
        expect(new Date(2021, 6, 1, 12).getTimezoneOffset()).toBe(julyOffset)
        expect(await stateHashes(library, CHOICES, settings)).toEqual(PINNED[label])
      }),
  )

  it('has something in every field the hashes pin, so a field cannot be pinned empty', () => {
    const session = new AnalysisSession()
    session.choosePeriod('all')
    const state = session.loadDigests(library, DATED)
    expect(state.trend.some((point) => point.runWkg !== null && point.rideWkg !== null)).toBe(true)
    expect(state.sameHeartRate.run.weeks.some((week) => week.fit !== null)).toBe(true)
    expect(state.sameHeartRate.ride.weeks.some((week) => week.fit !== null)).toBe(true)
    expect(state.lateEvidence.run.drift.length).toBeGreaterThan(0)
    expect(state.lateEvidence.ride.durability.length).toBeGreaterThan(0)
    expect(state.records.size).toBeGreaterThan(0)
    expect(state.result!.equivalents.length).toBeGreaterThan(0)
    expect(state.library).toHaveLength(400)
  })

  it('prices rides at all three dated masses, which change inside the library', () => {
    const session = new AnalysisSession()
    session.choosePeriod('all')
    const { trend } = session.loadDigests(library, DATED)
    const masses = new Set(trend.map((point) => point.rideMassKg).filter((kg) => kg !== undefined))
    expect([...masses].sort()).toEqual([71, 76, 82])
  })
})
