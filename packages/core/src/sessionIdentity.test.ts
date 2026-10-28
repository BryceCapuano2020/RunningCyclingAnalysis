import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AnalysisSession } from './session'
import type { Measurement } from './athlete'
import type { AthleteSettings } from './types'
import { copiedLibrary } from './test/libraryFixture'
import { stateHashes } from './test/stateHashes'

/**
 * The session state for a library of 400 copied activities under three periods, first taken from main at
 * 379c9458, before the draws were sorted by their bits, the trend and same-heart-rate windows were found
 * by search, and a summary was made once. It is taken for one body mass and for dated body masses, which
 * price each ride at its own weight. A change that only makes the analysis faster must leave every hash as
 * it is. A change that means to alter the analysis copies the received hashes from this test's failure,
 * and says in its description which field moved and why.
 *
 * Periods and dated masses are counted in local days, so the hashes are taken in UTC.
 */
const FIXED: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const mass = (value: number, from: string): Measurement => ({ kind: 'massKg', value, from })
const DATED: AthleteSettings = {
  ...FIXED,
  measurements: [mass(82, '2021-01-01'), mass(76, '2022-06-15'), mass(71, '2023-09-15')],
}
const CHOICES = ['default', 'all', 42] as const
const PINNED: Record<string, string> = {
  'dated "all"/effortTrends': 'b54bc4ffa285fcdf',
  'dated "all"/lateEvidence': '498e9e34783fbaa8',
  'dated "all"/library': '1b870ea71b928eb7',
  'dated "all"/period': '47579e1a1fbdd02b',
  'dated "all"/previous': '74234e98afe7498f',
  'dated "all"/records': 'c590d1878e50a716',
  'dated "all"/result': 'f5d2ba867bac908c',
  'dated "all"/sameHeartRate': '93dc5c7e232d0afe',
  'dated "all"/trend': 'e913f8caafe24cec',
  'dated "default"/effortTrends': 'b495c2943df0bb38',
  'dated "default"/lateEvidence': '89f961a046bc4693',
  'dated "default"/library': '1b870ea71b928eb7',
  'dated "default"/period': '6f360d1647ca0139',
  'dated "default"/previous': 'b6b783411ec48556',
  'dated "default"/records': 'c590d1878e50a716',
  'dated "default"/result': 'ba527f5f87446d18',
  'dated "default"/sameHeartRate': '784622306d69066e',
  'dated "default"/trend': 'e792148353190cb3',
  'dated 42/effortTrends': 'e76a028829401b1e',
  'dated 42/lateEvidence': '38d3d958b4687a74',
  'dated 42/library': '1b870ea71b928eb7',
  'dated 42/period': 'f52586cd25d95522',
  'dated 42/previous': '30654444c22910f1',
  'dated 42/records': 'c590d1878e50a716',
  'dated 42/result': '245f90dff58669ce',
  'dated 42/sameHeartRate': 'd9735a4225952df0',
  'dated 42/trend': '8956f9dc03ba6e3c',
  'fixed "all"/effortTrends': '80e1034e00d15dbd',
  'fixed "all"/lateEvidence': '498e9e34783fbaa8',
  'fixed "all"/library': 'a4aaf3b846398647',
  'fixed "all"/period': '47579e1a1fbdd02b',
  'fixed "all"/previous': '74234e98afe7498f',
  'fixed "all"/records': 'ddd2a6493f7bb9da',
  'fixed "all"/result': '7ed39a2204514f4d',
  'fixed "all"/sameHeartRate': '93dc5c7e232d0afe',
  'fixed "all"/trend': '67f692c560987411',
  'fixed "default"/effortTrends': '3b4422fef9957039',
  'fixed "default"/lateEvidence': '89f961a046bc4693',
  'fixed "default"/library': 'a4aaf3b846398647',
  'fixed "default"/period': '6f360d1647ca0139',
  'fixed "default"/previous': '655696e0b52415be',
  'fixed "default"/records': 'ddd2a6493f7bb9da',
  'fixed "default"/result': 'a48bcaf8b2eec440',
  'fixed "default"/sameHeartRate': '784622306d69066e',
  'fixed "default"/trend': 'b719562695332e32',
  'fixed 42/effortTrends': '94546c1ab54f801d',
  'fixed 42/lateEvidence': '38d3d958b4687a74',
  'fixed 42/library': 'a4aaf3b846398647',
  'fixed 42/period': 'f52586cd25d95522',
  'fixed 42/previous': 'bf5069e8ac665928',
  'fixed 42/records': 'ddd2a6493f7bb9da',
  'fixed 42/result': '61b28ec712fadc90',
  'fixed 42/sameHeartRate': 'd9735a4225952df0',
  'fixed 42/trend': '54e058d8e4bdedcb',
}

type Env = { env: Record<string, string | undefined> }
const env = (globalThis as { process?: Env }).process!.env
let savedZone: string | undefined
beforeAll(() => {
  savedZone = env.TZ
  env.TZ = 'UTC'
})
afterAll(() => {
  if (savedZone === undefined) delete env.TZ
  else env.TZ = savedZone
})

describe('session state', () => {
  const library = copiedLibrary(400)

  it('is byte for byte the pinned state of a 400-activity library under three periods, for one mass and for dated masses', async () => {
    const fixed = await stateHashes(library, CHOICES, FIXED)
    const dated = await stateHashes(library, CHOICES, DATED)
    const prefixed = (label: string, hashes: Record<string, string>) =>
      Object.entries(hashes).map(([key, hash]) => [`${label} ${key}`, hash])
    expect(Object.fromEntries([...prefixed('fixed', fixed), ...prefixed('dated', dated)])).toEqual(
      PINNED,
    )
  })

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
    // Dated masses are in play: the rides carry the mass they were priced at.
    expect(state.trend.some((point) => point.rideMassKg !== undefined)).toBe(true)
  })
})
