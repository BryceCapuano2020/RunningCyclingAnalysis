import { describe, expect, it } from 'vitest'
import { AnalysisSession } from './session'
import { copiedLibrary } from './test/libraryFixture'
import { stateHashes } from './test/stateHashes'

/**
 * The session state for a library of 400 copied activities under three periods, first taken from main at
 * aaf79118, before the draws were sorted by their bits, the trend and same-heart-rate windows were found
 * by search, and a summary was made once. A change that only makes the analysis faster must leave every
 * hash as it is. A change that means to alter the analysis copies the received hashes from this test's
 * failure, and says in its description which field moved and why.
 */
const PINNED: Record<string, string> = {
  '"all"/effortTrends': '80e1034e00d15dbd',
  '"all"/lateEvidence': '498e9e34783fbaa8',
  '"all"/library': 'a4aaf3b846398647',
  '"all"/period': 'b4022d2b20f6cb24',
  '"all"/previous': '74234e98afe7498f',
  '"all"/records': 'ddd2a6493f7bb9da',
  '"all"/result': '7ed39a2204514f4d',
  '"all"/sameHeartRate': '93dc5c7e232d0afe',
  '"all"/trend': '67f692c560987411',
  '"default"/effortTrends': '3b4422fef9957039',
  '"default"/lateEvidence': '89f961a046bc4693',
  '"default"/library': 'a4aaf3b846398647',
  '"default"/period': '7cbdf77a690f6297',
  '"default"/previous': '655696e0b52415be',
  '"default"/records': 'ddd2a6493f7bb9da',
  '"default"/result': 'a48bcaf8b2eec440',
  '"default"/sameHeartRate': '784622306d69066e',
  '"default"/trend': 'b719562695332e32',
  '42/effortTrends': '94546c1ab54f801d',
  '42/lateEvidence': '38d3d958b4687a74',
  '42/library': 'a4aaf3b846398647',
  '42/period': 'ee8d1f6b756898a2',
  '42/previous': 'bf5069e8ac665928',
  '42/records': 'ddd2a6493f7bb9da',
  '42/result': '61b28ec712fadc90',
  '42/sameHeartRate': 'd9735a4225952df0',
  '42/trend': '54e058d8e4bdedcb',
}

describe('session state', () => {
  const library = copiedLibrary(400)

  it('is byte for byte the pinned state of a 400-activity library under three periods', async () => {
    expect(await stateHashes(library, ['default', 'all', 42])).toEqual(PINNED)
  })

  it('has something in every field the hashes pin, so a field cannot be pinned empty', () => {
    const session = new AnalysisSession()
    session.choosePeriod('all')
    const state = session.loadDigests(library, { massKg: 75, bikeMassKg: 9 })
    expect(state.trend.some((point) => point.runWkg !== null && point.rideWkg !== null)).toBe(true)
    expect(state.sameHeartRate.run.weeks.some((week) => week.fit !== null)).toBe(true)
    expect(state.sameHeartRate.ride.weeks.some((week) => week.fit !== null)).toBe(true)
    expect(state.lateEvidence.run.drift.length).toBeGreaterThan(0)
    expect(state.lateEvidence.ride.durability.length).toBeGreaterThan(0)
    expect(state.records.size).toBeGreaterThan(0)
    expect(state.result!.equivalents.length).toBeGreaterThan(0)
    expect(state.library).toHaveLength(400)
  })
})
