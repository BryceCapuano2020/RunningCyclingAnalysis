import { describe, expect, it } from 'vitest'
import { AnalysisSession } from './session'
import type { Measurement } from './athlete'
import type { PeriodChoice } from './period'
import type { AthleteSettings } from './types'
import { copiedLibrary } from './test/libraryFixture'
import { stateHashes } from './test/stateHashes'
import { setAsideLibrary } from './zones/test/setAsideLibrary'

/**
 * The session state for a library of 400 copied activities, ten a week from 4 January 2021, under four
 * periods, first taken from main at 379c9458, before the draws were sorted by their bits, the trend and
 * same-heart-rate windows were found by search, and a summary was made once. The heart-rate judgement and the
 * time in zones were pinned when they were added, the heart-rate judgement at 379c9458 plus that change and the time in zones at #134; the judgement is the same under every period. A change that only makes
 * the analysis faster must leave every hash as it is. A change that means to alter the analysis copies
 * the received hashes from this test's failure, and says in its description which field moved and why.
 * Re-pinned for the record-distance tolerance: two of the 24 templates are 9.9 km runs and gain a 10 km
 * best, which moves `library` and `result` (the activity summaries carry distance bests) and no other field:
 * `heartRateJudgement` and `timeInZones` read no distance best and are as on main.
 * Re-pinned again for the analysis audit. `heartRateJudgement` gains the library's heart-rate `calibration` that every
 * period's equivalents read (this alone moves no other field, because the copied library's periods calibrate as the
 * library does). The athlete-relative heart-rate-for-power rule moves one stretch on the one template with a strap
 * failure (13 of the 24), so the flags in `library` and `result`, the heart rate masked there, and `timeInZones` move
 * with it; the trends, same-heart-rate, late-evidence, previous, records and period are as before.
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
/** The set-aside library runs from March 2024 to June 2025, so its custom range is inside that span. */
const SET_ASIDE_CHOICES: PeriodChoice[] = [
  'default',
  'all',
  42,
  { from: '2025-04-20', to: '2025-06-03' },
]

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
    '"default"/result': 'bb205e1db3a1b1db',
    '"default"/trend': 'b719562695332e32',
    '"default"/effortTrends': '3b4422fef9957039',
    '"default"/sameHeartRate': '784622306d69066e',
    '"default"/lateEvidence': '89f961a046bc4693',
    '"default"/previous': '655696e0b52415be',
    '"default"/records': 'ddd2a6493f7bb9da',
    '"default"/library': '1470bc54e8c4fdcc',
    '"default"/period': '6f360d1647ca0139',
    '"all"/result': 'b3170340c251b3ae',
    '"all"/trend': '67f692c560987411',
    '"all"/effortTrends': '80e1034e00d15dbd',
    '"all"/sameHeartRate': '93dc5c7e232d0afe',
    '"all"/lateEvidence': '498e9e34783fbaa8',
    '"all"/previous': '74234e98afe7498f',
    '"all"/records': 'ddd2a6493f7bb9da',
    '"all"/library': '1470bc54e8c4fdcc',
    '"all"/period': '47579e1a1fbdd02b',
    '42/result': 'ab05b687480966e3',
    '42/trend': '54e058d8e4bdedcb',
    '42/effortTrends': '94546c1ab54f801d',
    '42/sameHeartRate': 'd9735a4225952df0',
    '42/lateEvidence': '38d3d958b4687a74',
    '42/previous': 'bf5069e8ac665928',
    '42/records': 'ddd2a6493f7bb9da',
    '42/library': '1470bc54e8c4fdcc',
    '42/period': 'f52586cd25d95522',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': 'd7807f92e0d18177',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': 'c0ebd00cad64665b',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '04a14d73338881d4',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': '929495a9e564b189',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '1f59cbfa6c8715e8',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': 'f3b3def40fd38c7d',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': 'ddd2a6493f7bb9da',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '1470bc54e8c4fdcc',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '96d95e57a4633ca0',
    '"default"/heartRateJudgement': '91a87c3dc3d638d8',
    '"default"/timeInZones': '5d69671623631bc8',
    '"all"/heartRateJudgement': '91a87c3dc3d638d8',
    '"all"/timeInZones': 'e1eaef523ee395cc',
    '42/heartRateJudgement': '91a87c3dc3d638d8',
    '42/timeInZones': '21584cf2b012d892',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': '91a87c3dc3d638d8',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': '4693d1a1c6aec40c',
  },
  'dated in UTC': {
    '"default"/result': '405a429721bc91c7',
    '"default"/trend': '91fa83cbadee829f',
    '"default"/effortTrends': 'e2b1f5240f3dc980',
    '"default"/sameHeartRate': '784622306d69066e',
    '"default"/lateEvidence': '89f961a046bc4693',
    '"default"/previous': 'e0b3258ab88047ce',
    '"default"/records': '2e6b44bf83e3211c',
    '"default"/library': 'd5c8b3b3d20251b1',
    '"default"/period': '6f360d1647ca0139',
    '"all"/result': 'e77c995f4d6bafad',
    '"all"/trend': '5893b16c5b5cd288',
    '"all"/effortTrends': '64f439232bd29bff',
    '"all"/sameHeartRate': '93dc5c7e232d0afe',
    '"all"/lateEvidence': '498e9e34783fbaa8',
    '"all"/previous': '74234e98afe7498f',
    '"all"/records': '2e6b44bf83e3211c',
    '"all"/library': 'd5c8b3b3d20251b1',
    '"all"/period': '47579e1a1fbdd02b',
    '42/result': '4b2d44d206815015',
    '42/trend': 'a8ea041921cea373',
    '42/effortTrends': 'e57a7f08419005bf',
    '42/sameHeartRate': 'd9735a4225952df0',
    '42/lateEvidence': '38d3d958b4687a74',
    '42/previous': '0f2ffbe29f8d487b',
    '42/records': '2e6b44bf83e3211c',
    '42/library': 'd5c8b3b3d20251b1',
    '42/period': 'f52586cd25d95522',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': 'a2ff2bfc2ca1ec4c',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': 'd7f72a4f5918dbd6',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '99415c86ef44e359',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': '929495a9e564b189',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '1f59cbfa6c8715e8',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '9e7f5506d1f915e6',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '2e6b44bf83e3211c',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': 'd5c8b3b3d20251b1',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '96d95e57a4633ca0',
    '"default"/heartRateJudgement': 'a6353d809c20cd44',
    '"default"/timeInZones': '85b1c187b36d48fa',
    '"all"/heartRateJudgement': 'a6353d809c20cd44',
    '"all"/timeInZones': '042a78b0b1b7a913',
    '42/heartRateJudgement': 'a6353d809c20cd44',
    '42/timeInZones': '71047340c9c6e55a',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': 'a6353d809c20cd44',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': '3d14650bfe5963a2',
  },
  'dated in Los Angeles': {
    '"default"/result': '405a429721bc91c7',
    '"default"/trend': '91fa83cbadee829f',
    '"default"/effortTrends': 'e2b1f5240f3dc980',
    '"default"/sameHeartRate': '784622306d69066e',
    '"default"/lateEvidence': '89f961a046bc4693',
    '"default"/previous': 'e0b3258ab88047ce',
    '"default"/records': '2e6b44bf83e3211c',
    '"default"/library': 'd5c8b3b3d20251b1',
    '"default"/period': '7cbdf77a690f6297',
    '"all"/result': 'e77c995f4d6bafad',
    '"all"/trend': '5893b16c5b5cd288',
    '"all"/effortTrends': '64f439232bd29bff',
    '"all"/sameHeartRate': '93dc5c7e232d0afe',
    '"all"/lateEvidence': '498e9e34783fbaa8',
    '"all"/previous': '74234e98afe7498f',
    '"all"/records': '2e6b44bf83e3211c',
    '"all"/library': 'd5c8b3b3d20251b1',
    '"all"/period': 'b4022d2b20f6cb24',
    '42/result': '4b2d44d206815015',
    '42/trend': 'a8ea041921cea373',
    '42/effortTrends': 'e57a7f08419005bf',
    '42/sameHeartRate': 'd9735a4225952df0',
    '42/lateEvidence': '38d3d958b4687a74',
    '42/previous': '0f2ffbe29f8d487b',
    '42/records': '2e6b44bf83e3211c',
    '42/library': 'd5c8b3b3d20251b1',
    '42/period': 'ee8d1f6b756898a2',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': '6a2d133f060f1774',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': 'd7f72a4f5918dbd6',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '99415c86ef44e359',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': '929495a9e564b189',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '52ba56c96d62fc7e',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '21449b592650290f',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '2e6b44bf83e3211c',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': 'd5c8b3b3d20251b1',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '7de40011ebc2b6a9',
    '"default"/heartRateJudgement': 'a6353d809c20cd44',
    '"default"/timeInZones': '85b1c187b36d48fa',
    '"all"/heartRateJudgement': 'a6353d809c20cd44',
    '"all"/timeInZones': '042a78b0b1b7a913',
    '42/heartRateJudgement': 'a6353d809c20cd44',
    '42/timeInZones': '71047340c9c6e55a',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': 'a6353d809c20cd44',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': '03501554af7ccaff',
  },
  'dated in Auckland': {
    '"default"/result': '405a429721bc91c7',
    '"default"/trend': 'b5023db1f0ac6180',
    '"default"/effortTrends': 'e487a7179dc9e18b',
    '"default"/sameHeartRate': '4ff82c0d7332e7c3',
    '"default"/lateEvidence': '89f961a046bc4693',
    '"default"/previous': 'e0b3258ab88047ce',
    '"default"/records': '2e6b44bf83e3211c',
    '"default"/library': '797fb3f6ba4c3057',
    '"default"/period': 'c102373861471840',
    '"all"/result': '050e1b958ff711ca',
    '"all"/trend': 'c2cdeb6786bfc717',
    '"all"/effortTrends': '01d4ee8d84f2f486',
    '"all"/sameHeartRate': '93dc5c7e232d0afe',
    '"all"/lateEvidence': '498e9e34783fbaa8',
    '"all"/previous': '74234e98afe7498f',
    '"all"/records': '2e6b44bf83e3211c',
    '"all"/library': '797fb3f6ba4c3057',
    '"all"/period': '4e2b3f99b79165f0',
    '42/result': '4b2d44d206815015',
    '42/trend': '3ad48972fa2d6d03',
    '42/effortTrends': '469379a8a87249f9',
    '42/sameHeartRate': '530d52d0e56eaf4d',
    '42/lateEvidence': '38d3d958b4687a74',
    '42/previous': '0f2ffbe29f8d487b',
    '42/records': '2e6b44bf83e3211c',
    '42/library': '797fb3f6ba4c3057',
    '42/period': '8f564f063b3bbb04',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': '450d8323efc3d88a',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': 'd7f72a4f5918dbd6',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '99415c86ef44e359',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': '929495a9e564b189',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '642c86fde2c24962',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': 'c304b7331da7c4cc',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '2e6b44bf83e3211c',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '797fb3f6ba4c3057',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': 'aa4c803ea5ad72ed',
    '"default"/heartRateJudgement': 'a6353d809c20cd44',
    '"default"/timeInZones': '85b1c187b36d48fa',
    '"all"/heartRateJudgement': 'a6353d809c20cd44',
    '"all"/timeInZones': '7b4d5e05b4874b8a',
    '42/heartRateJudgement': 'a6353d809c20cd44',
    '42/timeInZones': '71047340c9c6e55a',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': 'a6353d809c20cd44',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': 'a5c0714150be4edc',
  },
}

/**
 * The state for the library of `setAsideLibrary()` (fifteen activities, where the heart-rate judgement sets one
 * activity aside whichever period is on screen), pinned when the library-wide set-aside was reviewed, at main
 * 4f4ccecb, under the same four settings and four periods, the custom range being inside that library's span.
 */
const PINNED_SET_ASIDE: Record<string, Record<string, string>> = {
  'fixed in UTC': {
    '"default"/result': 'be6f9b442885b05a',
    '"default"/trend': '85ed31114db3a588',
    '"default"/effortTrends': 'c2d5174066f766a7',
    '"default"/sameHeartRate': '83a614a6919cb65e',
    '"default"/lateEvidence': 'c9a81e3d3ecb531f',
    '"default"/heartRateJudgement': '710e2c83dd0ec4bd',
    '"default"/timeInZones': 'f7953609ae383487',
    '"default"/previous': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '04134dea3e1ce408',
    '"default"/period': '5c06f1b12de302f0',
    '"all"/result': '3a05d6bc29324a37',
    '"all"/trend': '49ac21090b6510ef',
    '"all"/effortTrends': 'cb5906df17f981ea',
    '"all"/sameHeartRate': '8cbaaa5aaaa348ee',
    '"all"/lateEvidence': '9ea3868bf71dee78',
    '"all"/heartRateJudgement': '710e2c83dd0ec4bd',
    '"all"/timeInZones': '35f59588139e50ec',
    '"all"/previous': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '04134dea3e1ce408',
    '"all"/period': '908d810a6805c001',
    '42/result': '4c9660ec7891772b',
    '42/trend': '5d14b247a6b2a5df',
    '42/effortTrends': 'e112561254448835',
    '42/sameHeartRate': 'd1965b6c30b122f7',
    '42/lateEvidence': '4a14a7534c788c35',
    '42/heartRateJudgement': '710e2c83dd0ec4bd',
    '42/timeInZones': '087a6cab53a91a24',
    '42/previous': '494f49d57b6e061c',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '04134dea3e1ce408',
    '42/period': '9c5c63cd365ca2ab',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': 'be6f9b442885b05a',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': 'b79645739dd0ed21',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': '432e255ae0c9441f',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': 'd5dbb114b810d2cf',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': 'c9a81e3d3ecb531f',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': '710e2c83dd0ec4bd',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': 'f7953609ae383487',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '04134dea3e1ce408',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': '040ccc203beb436c',
  },
  'dated in UTC': {
    '"default"/result': '76a3186383d77625',
    '"default"/trend': 'c51a0df0da49f618',
    '"default"/effortTrends': 'e1ea0b6b6ab812a4',
    '"default"/sameHeartRate': '83a614a6919cb65e',
    '"default"/lateEvidence': 'c9a81e3d3ecb531f',
    '"default"/heartRateJudgement': 'c65123ac6bd40b27',
    '"default"/timeInZones': 'f7953609ae383487',
    '"default"/previous': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '8b3122dd2e1b8dab',
    '"default"/period': '5c06f1b12de302f0',
    '"all"/result': '51a38f45c0747dc1',
    '"all"/trend': 'e8a0640549e1824c',
    '"all"/effortTrends': '5bbf9e67ba9d33a2',
    '"all"/sameHeartRate': '8cbaaa5aaaa348ee',
    '"all"/lateEvidence': '9ea3868bf71dee78',
    '"all"/heartRateJudgement': 'c65123ac6bd40b27',
    '"all"/timeInZones': '35f59588139e50ec',
    '"all"/previous': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '8b3122dd2e1b8dab',
    '"all"/period': '908d810a6805c001',
    '42/result': '17e150655442a0b1',
    '42/trend': '22268ace1a6ed0d6',
    '42/effortTrends': '698d0f5d6900ba92',
    '42/sameHeartRate': 'd1965b6c30b122f7',
    '42/lateEvidence': '4a14a7534c788c35',
    '42/heartRateJudgement': 'c65123ac6bd40b27',
    '42/timeInZones': '087a6cab53a91a24',
    '42/previous': '494f49d57b6e061c',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '8b3122dd2e1b8dab',
    '42/period': '9c5c63cd365ca2ab',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': '76a3186383d77625',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': 'de88fad35d61c703',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': 'a4f29cee63b697cd',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': 'd5dbb114b810d2cf',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': 'c9a81e3d3ecb531f',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': 'c65123ac6bd40b27',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': 'f7953609ae383487',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '8b3122dd2e1b8dab',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': '040ccc203beb436c',
  },
  'dated in Los Angeles': {
    '"default"/result': '76a3186383d77625',
    '"default"/trend': 'c51a0df0da49f618',
    '"default"/effortTrends': 'e1ea0b6b6ab812a4',
    '"default"/sameHeartRate': '83a614a6919cb65e',
    '"default"/lateEvidence': 'c9a81e3d3ecb531f',
    '"default"/heartRateJudgement': 'c65123ac6bd40b27',
    '"default"/timeInZones': 'f7953609ae383487',
    '"default"/previous': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '8b3122dd2e1b8dab',
    '"default"/period': '99c03466e443beb7',
    '"all"/result': '51a38f45c0747dc1',
    '"all"/trend': 'e8a0640549e1824c',
    '"all"/effortTrends': '5bbf9e67ba9d33a2',
    '"all"/sameHeartRate': '8cbaaa5aaaa348ee',
    '"all"/lateEvidence': '9ea3868bf71dee78',
    '"all"/heartRateJudgement': 'c65123ac6bd40b27',
    '"all"/timeInZones': '35f59588139e50ec',
    '"all"/previous': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '8b3122dd2e1b8dab',
    '"all"/period': '6183491011d5d5b5',
    '42/result': '17e150655442a0b1',
    '42/trend': '22268ace1a6ed0d6',
    '42/effortTrends': '698d0f5d6900ba92',
    '42/sameHeartRate': 'd1965b6c30b122f7',
    '42/lateEvidence': '4a14a7534c788c35',
    '42/heartRateJudgement': 'c65123ac6bd40b27',
    '42/timeInZones': '087a6cab53a91a24',
    '42/previous': '494f49d57b6e061c',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '8b3122dd2e1b8dab',
    '42/period': '4115668a63751e03',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': '76a3186383d77625',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': 'de88fad35d61c703',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': 'a4f29cee63b697cd',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': 'd5dbb114b810d2cf',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': 'c9a81e3d3ecb531f',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': 'c65123ac6bd40b27',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': 'f7953609ae383487',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '8b3122dd2e1b8dab',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': '8d270473f6fc81d0',
  },
  'dated in Auckland': {
    '"default"/result': '76a3186383d77625',
    '"default"/trend': 'c51a0df0da49f618',
    '"default"/effortTrends': 'e1ea0b6b6ab812a4',
    '"default"/sameHeartRate': '83a614a6919cb65e',
    '"default"/lateEvidence': 'c9a81e3d3ecb531f',
    '"default"/heartRateJudgement': 'c65123ac6bd40b27',
    '"default"/timeInZones': 'f7953609ae383487',
    '"default"/previous': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '8b3122dd2e1b8dab',
    '"default"/period': '1d6877d85a5029bb',
    '"all"/result': '51a38f45c0747dc1',
    '"all"/trend': 'e8a0640549e1824c',
    '"all"/effortTrends': '5bbf9e67ba9d33a2',
    '"all"/sameHeartRate': '8cbaaa5aaaa348ee',
    '"all"/lateEvidence': '9ea3868bf71dee78',
    '"all"/heartRateJudgement': 'c65123ac6bd40b27',
    '"all"/timeInZones': '35f59588139e50ec',
    '"all"/previous': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '8b3122dd2e1b8dab',
    '"all"/period': 'c8bcf9bb00b45238',
    '42/result': '17e150655442a0b1',
    '42/trend': '22268ace1a6ed0d6',
    '42/effortTrends': '698d0f5d6900ba92',
    '42/sameHeartRate': 'd1965b6c30b122f7',
    '42/lateEvidence': '4a14a7534c788c35',
    '42/heartRateJudgement': 'c65123ac6bd40b27',
    '42/timeInZones': '087a6cab53a91a24',
    '42/previous': '494f49d57b6e061c',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '8b3122dd2e1b8dab',
    '42/period': '380732de5220fc6a',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': '70838ddfc9253cbd',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': '445c2499208249b5',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': '28948fb2aa6c2045',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': '7f2f17ef1a79b633',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': 'b5699ccffdffe82d',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': 'c65123ac6bd40b27',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': '661cb1a236ddedd2',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '8b3122dd2e1b8dab',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': 'ece551b7dbacbdf5',
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
  const setAside = setAsideLibrary().digests

  it.each(SETTINGS)(
    'is byte for byte the pinned state of 400 activities, $label',
    ({ label, zone, julyOffset, settings }) =>
      inZone(zone, async () => {
        expect(new Date(2021, 6, 1, 12).getTimezoneOffset()).toBe(julyOffset)
        expect(await stateHashes(library, CHOICES, settings)).toEqual(PINNED[label])
      }),
  )

  it.each(SETTINGS)(
    'is byte for byte the pinned state of a library where heart rate is set aside, $label',
    ({ label, zone, julyOffset, settings }) =>
      inZone(zone, async () => {
        expect(new Date(2021, 6, 1, 12).getTimezoneOffset()).toBe(julyOffset)
        const hashes = await stateHashes(setAside, SET_ASIDE_CHOICES, settings)
        expect(hashes).toEqual(PINNED_SET_ASIDE[label])
      }),
  )

  it('sets heart rate aside in that library, under every period and setting', () => {
    for (const { settings } of SETTINGS) {
      for (const choice of SET_ASIDE_CHOICES) {
        const session = new AnalysisSession()
        session.choosePeriod(choice)
        const state = session.loadDigests(setAside, settings)
        expect(state.heartRateJudgement.setAside.length).toBeGreaterThan(0)
      }
    }
  })

  it('has something in every field the hashes pin, so a field cannot be pinned empty', () => {
    const session = new AnalysisSession()
    session.choosePeriod('all')
    const state = session.loadDigests(library, DATED)
    expect(state.trend.some((point) => point.runWkg !== null && point.rideWkg !== null)).toBe(true)
    expect(state.sameHeartRate.run.weeks.some((week) => week.fit !== null)).toBe(true)
    expect(state.sameHeartRate.ride.weeks.some((week) => week.fit !== null)).toBe(true)
    expect(state.lateEvidence.run.drift.length).toBeGreaterThan(0)
    expect(state.heartRateJudgement.referenceHr.run).toBeGreaterThan(0)
    expect(state.heartRateJudgement.threshold.ride).toBeGreaterThan(0)
    expect(state.timeInZones.current.run.some((row) => row.counted > 0)).toBe(true)
    expect(state.timeInZones.current.ride.some((row) => row.counted > 0)).toBe(true)
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
