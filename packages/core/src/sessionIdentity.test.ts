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
 * Re-pinned for period-independent zones. `heartRateJudgement` gains the library's `observedMaxHr` (every period, since the
 * judgement is the library's) and its reported threshold `fit`s. The new `zoneEstimates` field is the library-wide thresholds
 * and reference heart rates that zones are cut from, and is the same under every period. A period's analysis now takes the library's reference heart
 * rates, so the one period that is not the whole library (the custom range) moves `result` where its own maximum differed
 * (three of four settings; the set-aside library's custom range under Auckland), and the zones of every period are cut by
 * the library's references, which moves `timeInZones` where the period's own references differed.
 * Re-pinned for the estimated-ride gate. `heartRateJudgement` gains the library's `rideGate` (per duration, the heart rate of its
 * power-meter rides on their watts, and the durations it has measured), which every period, trend and record reads. The hash of the
 * judgement without that field is the one pinned before. The one other field to move is `result` of the set-aside library's custom
 * range under Auckland's dated masses: a virtual ride's 10 min point there is unbacked (the library's gate has no line at 10 min and has
 * measured it, though the period has not), so the 10 min best comes from the same ride's 20 min window, 0.02 W lower; the rideCurve, its
 * metabolic curve and what is priced from them (comparison, equivalents, effort) move with it. Every other field is as it was.
 * Re-pinned for the previous period's effort check. `previous` (the curves of the period before) gains `headlineEffort`, the heart-rate
 * check of its best 20 min against the library's reference heart rates and set-aside list, which Balance's what-changed strip reads to
 * compare only bests that were hard efforts. The curves in it are as they were. Only `previous` moves, under the three periods that have one
 * (default, 42 days and the custom range); `all` has none, and every other field is as it was.
 * Re-pinned for pace zones on the speed bins. A pace zone's edges are the published cuts moved to the nearest
 * 0.05 m/s, the step of the digest's speed bins, so no bin straddles an edge and the period view's seconds in a pace zone
 * are the activity page's, and the top pace edge always moves up, so it stays above the threshold speed. Power edges are moved to the nearest 5 W for the same reason (the digest's power bins are 5 W).
 * Only `timeInZones` moves (the run pace rows and the ride power rows, under every period and setting); the digests it reads
 * are as they were.
 *
 * Added the `fitness` field (fitness at the same effort, per sport, library-wide): a new key under every period, the same under all
 * four, and no existing hash moves. The status reads the session clock, which the hashes set to the library's last day.
 * Added `series` to each sport's fitness status (the level at four-weekly steps for the evidence chart): only the `fitness` hashes
 * moved, the same under every period and setting: to a new value for the 400-activity library, whose steady runs give a series, and to another for the fixed 2025 library. (A step is dated by the last Sunday it includes and carries the weeks it is read over.)
 * Re-pinned for the reference values (C1). A maximum heart rate is the highest value several separate days reached, over the last
 * three years, not the single highest reading, and an estimated pace or power threshold is the fit over the half year before
 * the activity, by week, not the whole library's. Moved, for the 400-activity library: `heartRateJudgement` gains `observedMaxSource`
 * (what each maximum rests on) and `thresholdTimeline`, and its values are as they were; `zoneEstimates` drops the library's
 * `runCp` and `rideCp` for `thresholds` (the same fits by week) and `observedMaxSource`, its heart rates as they were; and
 * `timeInZones` moves where a ride's power zones are cut by a threshold of its own half year, under the three dated settings
 * only (the fixed setting's copies of the library repeat one threshold, so its zones are as they were). `result`, the trends,
 * same-heart-rate, late evidence, fitness, previous, records, library and period are as they were. For the set-aside library, whose
 * fixture now gives two more rides the 250 bpm peak that the borderline ride has, since one reading no longer sets a
 * maximum: `library` and `result.activities` carry those two peaks; the references move (`referenceHr`, `observedMaxHr`, and
 * `result`'s maximum heart rates and the effort checks divided by them); `previous.headlineEffort` is the check against the
 * new reference; `timeInZones` moves with the heart-rate edges and the thresholds by week. Its set-aside, calibration and ride
 * gate are as they were. `fitness` reads neither the maximum nor the zones, and does not move in either library.
 *
 * Added the `change` field (the change test of the period against the one before it, D5): a new key under every period and setting,
 * null under `all`, and no existing hash moves. It is computed from the same digests and prices as `previous`, so it moves only when the
 * test's own rule does.
 *
 * Re-pinned for the review of the change test (D5). Four fields moved and no other: `change` (each call gains its basis, the
 * stricter band and drops nothing a page reads; the numbers are the same draws), `trend` and `effortTrends` (a point no longer
 * carries `rideRunSpeed`, the running equivalent only the retired grade trend read, so the `equivalence` pass is gone), and
 * `sameHeartRate` (the end-week `change` object, which no page reads, is replaced by `reportedWeeks`). The curves, the
 * analysis, the previous period, the records, the fitness and the judgement are as they were, which also shows that bestCurves
 * through the shared reading rule gives the same bests as before.
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
    '"default"/trend': '986f078585c21ccf',
    '"default"/effortTrends': '053dfe197d79ffcd',
    '"default"/sameHeartRate': '40444ed753a9bf42',
    '"default"/lateEvidence': '89f961a046bc4693',
    '"default"/heartRateJudgement': 'ff52075bd0655016',
    '"default"/fitness': 'f260e7639badadcd',
    '"default"/zoneEstimates': '8894c9979d494269',
    '"default"/timeInZones': '59697a3d728ee189',
    '"default"/previous': 'ac192f8588859cf6',
    '"default"/change': 'a1e5ea8888d2ef26',
    '"default"/records': 'ddd2a6493f7bb9da',
    '"default"/library': '1470bc54e8c4fdcc',
    '"default"/period': '6f360d1647ca0139',
    '"all"/result': 'b3170340c251b3ae',
    '"all"/trend': '0df145850e4069f4',
    '"all"/effortTrends': 'ffc7d0f8136054ab',
    '"all"/sameHeartRate': '3f719a2480018a7a',
    '"all"/lateEvidence': '498e9e34783fbaa8',
    '"all"/heartRateJudgement': 'ff52075bd0655016',
    '"all"/fitness': 'f260e7639badadcd',
    '"all"/zoneEstimates': '8894c9979d494269',
    '"all"/timeInZones': 'dcce5e1c4e71dcc6',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'ddd2a6493f7bb9da',
    '"all"/library': '1470bc54e8c4fdcc',
    '"all"/period': '47579e1a1fbdd02b',
    '42/result': 'ab05b687480966e3',
    '42/trend': '4eb90bfa88594dbb',
    '42/effortTrends': '479f6549927b99bf',
    '42/sameHeartRate': 'cf177b9fcca2791f',
    '42/lateEvidence': '38d3d958b4687a74',
    '42/heartRateJudgement': 'ff52075bd0655016',
    '42/fitness': 'f260e7639badadcd',
    '42/zoneEstimates': '8894c9979d494269',
    '42/timeInZones': '03c82d2938110039',
    '42/previous': '0a3e752caa4636ef',
    '42/change': 'd226776592691d74',
    '42/records': 'ddd2a6493f7bb9da',
    '42/library': '1470bc54e8c4fdcc',
    '42/period': 'f52586cd25d95522',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': '102fbc739b0783bc',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': 'd2bfd726d1a6a8e3',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': 'cc80893dfd167376',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': 'b7c81002f7e5afe7',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '1f59cbfa6c8715e8',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': 'ff52075bd0655016',
    '{"from":"2021-03-10","to":"2021-03-20"}/fitness': 'f260e7639badadcd',
    '{"from":"2021-03-10","to":"2021-03-20"}/zoneEstimates': '8894c9979d494269',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': 'af64405932696e7a',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '8c614377a488ac4c',
    '{"from":"2021-03-10","to":"2021-03-20"}/change': 'ed3d5229e65cca15',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': 'ddd2a6493f7bb9da',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '1470bc54e8c4fdcc',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '96d95e57a4633ca0',
  },
  'dated in UTC': {
    '"default"/result': '405a429721bc91c7',
    '"default"/trend': 'd8727adadbe49aba',
    '"default"/effortTrends': '2747a3406fb169ff',
    '"default"/sameHeartRate': '40444ed753a9bf42',
    '"default"/lateEvidence': '89f961a046bc4693',
    '"default"/heartRateJudgement': '23c17ffd6027dca0',
    '"default"/fitness': 'f260e7639badadcd',
    '"default"/zoneEstimates': '3e0542e9363ed810',
    '"default"/timeInZones': '59697a3d728ee189',
    '"default"/previous': '1be58eca2e1552ff',
    '"default"/change': 'f7d575544f72c1df',
    '"default"/records': '2e6b44bf83e3211c',
    '"default"/library': 'd5c8b3b3d20251b1',
    '"default"/period': '6f360d1647ca0139',
    '"all"/result': 'e77c995f4d6bafad',
    '"all"/trend': '2017d034814c9eb2',
    '"all"/effortTrends': '8a0b03f038cdf8b5',
    '"all"/sameHeartRate': '3f719a2480018a7a',
    '"all"/lateEvidence': '498e9e34783fbaa8',
    '"all"/heartRateJudgement': '23c17ffd6027dca0',
    '"all"/fitness': 'f260e7639badadcd',
    '"all"/zoneEstimates': '3e0542e9363ed810',
    '"all"/timeInZones': 'aafd189d76df2670',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': '2e6b44bf83e3211c',
    '"all"/library': 'd5c8b3b3d20251b1',
    '"all"/period': '47579e1a1fbdd02b',
    '42/result': '4b2d44d206815015',
    '42/trend': 'a2adbb7e6eba1479',
    '42/effortTrends': 'd8a5902afced45cd',
    '42/sameHeartRate': 'cf177b9fcca2791f',
    '42/lateEvidence': '38d3d958b4687a74',
    '42/heartRateJudgement': '23c17ffd6027dca0',
    '42/fitness': 'f260e7639badadcd',
    '42/zoneEstimates': '3e0542e9363ed810',
    '42/timeInZones': '03c82d2938110039',
    '42/previous': 'ca6444cc39509126',
    '42/change': '766c5271774e12f6',
    '42/records': '2e6b44bf83e3211c',
    '42/library': 'd5c8b3b3d20251b1',
    '42/period': 'f52586cd25d95522',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': 'f9ab41d7c5c11835',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': '243239299fa12f52',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '783409bd9491fb1a',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': 'b7c81002f7e5afe7',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '1f59cbfa6c8715e8',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': '23c17ffd6027dca0',
    '{"from":"2021-03-10","to":"2021-03-20"}/fitness': 'f260e7639badadcd',
    '{"from":"2021-03-10","to":"2021-03-20"}/zoneEstimates': '3e0542e9363ed810',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': 'b0bb2347edb4b23f',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': 'ab29bf01608c7daf',
    '{"from":"2021-03-10","to":"2021-03-20"}/change': 'e3e58992aeb7df9d',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '2e6b44bf83e3211c',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': 'd5c8b3b3d20251b1',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '96d95e57a4633ca0',
  },
  'dated in Los Angeles': {
    '"default"/result': '405a429721bc91c7',
    '"default"/trend': 'd8727adadbe49aba',
    '"default"/effortTrends': '2747a3406fb169ff',
    '"default"/sameHeartRate': '40444ed753a9bf42',
    '"default"/lateEvidence': '89f961a046bc4693',
    '"default"/heartRateJudgement': '23c17ffd6027dca0',
    '"default"/fitness': 'f260e7639badadcd',
    '"default"/zoneEstimates': '3e0542e9363ed810',
    '"default"/timeInZones': '59697a3d728ee189',
    '"default"/previous': '1be58eca2e1552ff',
    '"default"/change': 'f7d575544f72c1df',
    '"default"/records': '2e6b44bf83e3211c',
    '"default"/library': 'd5c8b3b3d20251b1',
    '"default"/period': '7cbdf77a690f6297',
    '"all"/result': 'e77c995f4d6bafad',
    '"all"/trend': '2017d034814c9eb2',
    '"all"/effortTrends': '8a0b03f038cdf8b5',
    '"all"/sameHeartRate': '3f719a2480018a7a',
    '"all"/lateEvidence': '498e9e34783fbaa8',
    '"all"/heartRateJudgement': '23c17ffd6027dca0',
    '"all"/fitness': 'f260e7639badadcd',
    '"all"/zoneEstimates': '3e0542e9363ed810',
    '"all"/timeInZones': 'aafd189d76df2670',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': '2e6b44bf83e3211c',
    '"all"/library': 'd5c8b3b3d20251b1',
    '"all"/period': 'b4022d2b20f6cb24',
    '42/result': '4b2d44d206815015',
    '42/trend': 'a2adbb7e6eba1479',
    '42/effortTrends': 'd8a5902afced45cd',
    '42/sameHeartRate': 'cf177b9fcca2791f',
    '42/lateEvidence': '38d3d958b4687a74',
    '42/heartRateJudgement': '23c17ffd6027dca0',
    '42/fitness': 'f260e7639badadcd',
    '42/zoneEstimates': '3e0542e9363ed810',
    '42/timeInZones': '03c82d2938110039',
    '42/previous': 'ca6444cc39509126',
    '42/change': '766c5271774e12f6',
    '42/records': '2e6b44bf83e3211c',
    '42/library': 'd5c8b3b3d20251b1',
    '42/period': 'ee8d1f6b756898a2',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': 'b89bdeba29b5dc35',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': '243239299fa12f52',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '783409bd9491fb1a',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': 'b7c81002f7e5afe7',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '52ba56c96d62fc7e',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': '23c17ffd6027dca0',
    '{"from":"2021-03-10","to":"2021-03-20"}/fitness': 'f260e7639badadcd',
    '{"from":"2021-03-10","to":"2021-03-20"}/zoneEstimates': '3e0542e9363ed810',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': 'e3f2cf74ab9609f7',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '16901b6823f7417d',
    '{"from":"2021-03-10","to":"2021-03-20"}/change': '5de6cfefceb6d716',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '2e6b44bf83e3211c',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': 'd5c8b3b3d20251b1',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '7de40011ebc2b6a9',
  },
  'dated in Auckland': {
    '"default"/result': '405a429721bc91c7',
    '"default"/trend': 'ef052443e3926d86',
    '"default"/effortTrends': 'b7512a0de8989888',
    '"default"/sameHeartRate': '2ab108ebdd2c5f73',
    '"default"/lateEvidence': '89f961a046bc4693',
    '"default"/heartRateJudgement': '8c75a793ae897f0c',
    '"default"/fitness': 'f260e7639badadcd',
    '"default"/zoneEstimates': '61c598e88a834828',
    '"default"/timeInZones': '59697a3d728ee189',
    '"default"/previous': '1be58eca2e1552ff',
    '"default"/change': 'f7d575544f72c1df',
    '"default"/records': '2e6b44bf83e3211c',
    '"default"/library': '797fb3f6ba4c3057',
    '"default"/period': 'c102373861471840',
    '"all"/result': '050e1b958ff711ca',
    '"all"/trend': '6a8b41ca2f0de62c',
    '"all"/effortTrends': 'b1d6c7d72deba638',
    '"all"/sameHeartRate': '3f719a2480018a7a',
    '"all"/lateEvidence': '498e9e34783fbaa8',
    '"all"/heartRateJudgement': '8c75a793ae897f0c',
    '"all"/fitness': 'f260e7639badadcd',
    '"all"/zoneEstimates': '61c598e88a834828',
    '"all"/timeInZones': '9d3ee80a2fb80cc3',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': '2e6b44bf83e3211c',
    '"all"/library': '797fb3f6ba4c3057',
    '"all"/period': '4e2b3f99b79165f0',
    '42/result': '4b2d44d206815015',
    '42/trend': '58b10045c86a582f',
    '42/effortTrends': '003482d23298c626',
    '42/sameHeartRate': 'b1d5354d1fb0f3c3',
    '42/lateEvidence': '38d3d958b4687a74',
    '42/heartRateJudgement': '8c75a793ae897f0c',
    '42/fitness': 'f260e7639badadcd',
    '42/zoneEstimates': '61c598e88a834828',
    '42/timeInZones': '03c82d2938110039',
    '42/previous': 'ca6444cc39509126',
    '42/change': '766c5271774e12f6',
    '42/records': '2e6b44bf83e3211c',
    '42/library': '797fb3f6ba4c3057',
    '42/period': '8f564f063b3bbb04',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': '450d8323efc3d88a',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': '243239299fa12f52',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '783409bd9491fb1a',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': 'b7c81002f7e5afe7',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '642c86fde2c24962',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': '8c75a793ae897f0c',
    '{"from":"2021-03-10","to":"2021-03-20"}/fitness': 'f260e7639badadcd',
    '{"from":"2021-03-10","to":"2021-03-20"}/zoneEstimates': '61c598e88a834828',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': 'b908ecf3b661b699',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '0917cd4c2e1db277',
    '{"from":"2021-03-10","to":"2021-03-20"}/change': '92edebc1afcd4aac',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '2e6b44bf83e3211c',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '797fb3f6ba4c3057',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': 'aa4c803ea5ad72ed',
  },
}

/**
 * The state for the library of `setAsideLibrary()` (fifteen activities, where the heart-rate judgement sets one
 * activity aside whichever period is on screen), pinned when the library-wide set-aside was reviewed, at main
 * 4f4ccecb, under the same four settings and four periods, the custom range being inside that library's span.
 */
const PINNED_SET_ASIDE: Record<string, Record<string, string>> = {
  'fixed in UTC': {
    '"default"/result': '85d613459931984b',
    '"default"/trend': '43e2ac920d762756',
    '"default"/effortTrends': 'baedb35f9cea9ec1',
    '"default"/sameHeartRate': '8babbc0295b5c8f6',
    '"default"/lateEvidence': 'c9a81e3d3ecb531f',
    '"default"/heartRateJudgement': 'f8da377c42906918',
    '"default"/fitness': '007becf60abf3550',
    '"default"/zoneEstimates': '8b8cf6fedc6d5953',
    '"default"/timeInZones': '451ede684070874b',
    '"default"/previous': '74234e98afe7498f',
    '"default"/change': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '9efa37e8bfb8c3d9',
    '"default"/period': '5c06f1b12de302f0',
    '"all"/result': 'cf5d13e6a588d464',
    '"all"/trend': '17f6c339a76cf6f4',
    '"all"/effortTrends': 'a2a46e9bb614a550',
    '"all"/sameHeartRate': '524ba8e896848f76',
    '"all"/lateEvidence': '9ea3868bf71dee78',
    '"all"/heartRateJudgement': 'f8da377c42906918',
    '"all"/fitness': '007becf60abf3550',
    '"all"/zoneEstimates': '8b8cf6fedc6d5953',
    '"all"/timeInZones': '5eef9e060396a5ff',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '9efa37e8bfb8c3d9',
    '"all"/period': '908d810a6805c001',
    '42/result': '4c159fab937c557b',
    '42/trend': '8e9171f6508ccab9',
    '42/effortTrends': 'af62014c28c1452e',
    '42/sameHeartRate': '2cdb59cf7d381a18',
    '42/lateEvidence': '4a14a7534c788c35',
    '42/heartRateJudgement': 'f8da377c42906918',
    '42/fitness': '007becf60abf3550',
    '42/zoneEstimates': '8b8cf6fedc6d5953',
    '42/timeInZones': 'da1c1750f22e56b5',
    '42/previous': 'f830be42f987760f',
    '42/change': 'bc95834834415bb4',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '9efa37e8bfb8c3d9',
    '42/period': '9c5c63cd365ca2ab',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': '85d613459931984b',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': 'c4124cae0c6ec46f',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': '1f552e4ad0f24c5f',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': '25c037acb374ef02',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': 'c9a81e3d3ecb531f',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': 'f8da377c42906918',
    '{"from":"2025-04-20","to":"2025-06-03"}/fitness': '007becf60abf3550',
    '{"from":"2025-04-20","to":"2025-06-03"}/zoneEstimates': '8b8cf6fedc6d5953',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': '451ede684070874b',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/change': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '9efa37e8bfb8c3d9',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': '040ccc203beb436c',
  },
  'dated in UTC': {
    '"default"/result': '72c073adb80966fd',
    '"default"/trend': '89f246bf79e2e081',
    '"default"/effortTrends': '3ef059736424533d',
    '"default"/sameHeartRate': '8babbc0295b5c8f6',
    '"default"/lateEvidence': 'c9a81e3d3ecb531f',
    '"default"/heartRateJudgement': 'f996e628e5c5f9d5',
    '"default"/fitness': '007becf60abf3550',
    '"default"/zoneEstimates': 'ef8049a77ba85d81',
    '"default"/timeInZones': '451ede684070874b',
    '"default"/previous': '74234e98afe7498f',
    '"default"/change': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '8090803740e0053c',
    '"default"/period': '5c06f1b12de302f0',
    '"all"/result': '2b0d0b14e71d8eb5',
    '"all"/trend': 'efdc06a6f31390f8',
    '"all"/effortTrends': 'd67d90b50e0b0a1c',
    '"all"/sameHeartRate': '524ba8e896848f76',
    '"all"/lateEvidence': '9ea3868bf71dee78',
    '"all"/heartRateJudgement': 'f996e628e5c5f9d5',
    '"all"/fitness': '007becf60abf3550',
    '"all"/zoneEstimates': 'ef8049a77ba85d81',
    '"all"/timeInZones': '5eef9e060396a5ff',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '8090803740e0053c',
    '"all"/period': '908d810a6805c001',
    '42/result': '7ff204a68f9d5a65',
    '42/trend': '3631a41c96a19f5f',
    '42/effortTrends': 'e4f95c6f8ec82d9a',
    '42/sameHeartRate': '2cdb59cf7d381a18',
    '42/lateEvidence': '4a14a7534c788c35',
    '42/heartRateJudgement': 'f996e628e5c5f9d5',
    '42/fitness': '007becf60abf3550',
    '42/zoneEstimates': 'ef8049a77ba85d81',
    '42/timeInZones': 'da1c1750f22e56b5',
    '42/previous': 'f830be42f987760f',
    '42/change': 'bc95834834415bb4',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '8090803740e0053c',
    '42/period': '9c5c63cd365ca2ab',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': '72c073adb80966fd',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': '7806d696dcfffdc9',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': 'fb852c4a8e89752a',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': '25c037acb374ef02',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': 'c9a81e3d3ecb531f',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': 'f996e628e5c5f9d5',
    '{"from":"2025-04-20","to":"2025-06-03"}/fitness': '007becf60abf3550',
    '{"from":"2025-04-20","to":"2025-06-03"}/zoneEstimates': 'ef8049a77ba85d81',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': '451ede684070874b',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/change': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '8090803740e0053c',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': '040ccc203beb436c',
  },
  'dated in Los Angeles': {
    '"default"/result': '72c073adb80966fd',
    '"default"/trend': '89f246bf79e2e081',
    '"default"/effortTrends': '3ef059736424533d',
    '"default"/sameHeartRate': '8babbc0295b5c8f6',
    '"default"/lateEvidence': 'c9a81e3d3ecb531f',
    '"default"/heartRateJudgement': 'f996e628e5c5f9d5',
    '"default"/fitness': '007becf60abf3550',
    '"default"/zoneEstimates': 'ef8049a77ba85d81',
    '"default"/timeInZones': '451ede684070874b',
    '"default"/previous': '74234e98afe7498f',
    '"default"/change': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '8090803740e0053c',
    '"default"/period': '99c03466e443beb7',
    '"all"/result': '2b0d0b14e71d8eb5',
    '"all"/trend': 'efdc06a6f31390f8',
    '"all"/effortTrends': 'd67d90b50e0b0a1c',
    '"all"/sameHeartRate': '524ba8e896848f76',
    '"all"/lateEvidence': '9ea3868bf71dee78',
    '"all"/heartRateJudgement': 'f996e628e5c5f9d5',
    '"all"/fitness': '007becf60abf3550',
    '"all"/zoneEstimates': 'ef8049a77ba85d81',
    '"all"/timeInZones': '5eef9e060396a5ff',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '8090803740e0053c',
    '"all"/period': '6183491011d5d5b5',
    '42/result': '7ff204a68f9d5a65',
    '42/trend': '3631a41c96a19f5f',
    '42/effortTrends': 'e4f95c6f8ec82d9a',
    '42/sameHeartRate': '2cdb59cf7d381a18',
    '42/lateEvidence': '4a14a7534c788c35',
    '42/heartRateJudgement': 'f996e628e5c5f9d5',
    '42/fitness': '007becf60abf3550',
    '42/zoneEstimates': 'ef8049a77ba85d81',
    '42/timeInZones': 'da1c1750f22e56b5',
    '42/previous': 'f830be42f987760f',
    '42/change': 'bc95834834415bb4',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '8090803740e0053c',
    '42/period': '4115668a63751e03',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': '72c073adb80966fd',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': '7806d696dcfffdc9',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': 'fb852c4a8e89752a',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': '25c037acb374ef02',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': 'c9a81e3d3ecb531f',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': 'f996e628e5c5f9d5',
    '{"from":"2025-04-20","to":"2025-06-03"}/fitness': '007becf60abf3550',
    '{"from":"2025-04-20","to":"2025-06-03"}/zoneEstimates': 'ef8049a77ba85d81',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': '451ede684070874b',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/change': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '8090803740e0053c',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': '8d270473f6fc81d0',
  },
  'dated in Auckland': {
    '"default"/result': '72c073adb80966fd',
    '"default"/trend': '89f246bf79e2e081',
    '"default"/effortTrends': '3ef059736424533d',
    '"default"/sameHeartRate': '8babbc0295b5c8f6',
    '"default"/lateEvidence': 'c9a81e3d3ecb531f',
    '"default"/heartRateJudgement': 'f996e628e5c5f9d5',
    '"default"/fitness': '007becf60abf3550',
    '"default"/zoneEstimates': 'ef8049a77ba85d81',
    '"default"/timeInZones': '451ede684070874b',
    '"default"/previous': '74234e98afe7498f',
    '"default"/change': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '8090803740e0053c',
    '"default"/period': '1d6877d85a5029bb',
    '"all"/result': '2b0d0b14e71d8eb5',
    '"all"/trend': 'efdc06a6f31390f8',
    '"all"/effortTrends': 'd67d90b50e0b0a1c',
    '"all"/sameHeartRate': '524ba8e896848f76',
    '"all"/lateEvidence': '9ea3868bf71dee78',
    '"all"/heartRateJudgement': 'f996e628e5c5f9d5',
    '"all"/fitness': '007becf60abf3550',
    '"all"/zoneEstimates': 'ef8049a77ba85d81',
    '"all"/timeInZones': '5eef9e060396a5ff',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '8090803740e0053c',
    '"all"/period': 'c8bcf9bb00b45238',
    '42/result': '7ff204a68f9d5a65',
    '42/trend': '3631a41c96a19f5f',
    '42/effortTrends': 'e4f95c6f8ec82d9a',
    '42/sameHeartRate': '2cdb59cf7d381a18',
    '42/lateEvidence': '4a14a7534c788c35',
    '42/heartRateJudgement': 'f996e628e5c5f9d5',
    '42/fitness': '007becf60abf3550',
    '42/zoneEstimates': 'ef8049a77ba85d81',
    '42/timeInZones': 'da1c1750f22e56b5',
    '42/previous': 'f830be42f987760f',
    '42/change': 'bc95834834415bb4',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '8090803740e0053c',
    '42/period': '380732de5220fc6a',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': '78e1434575c1bf3f',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': 'f3b3cd57dec59a37',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': 'a2aa81bb594c69da',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': '8f9953d621f1adb4',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': 'b5699ccffdffe82d',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': 'f996e628e5c5f9d5',
    '{"from":"2025-04-20","to":"2025-06-03"}/fitness': '007becf60abf3550',
    '{"from":"2025-04-20","to":"2025-06-03"}/zoneEstimates': 'ef8049a77ba85d81',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': '7b3d64a91400ba1d',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/change': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '8090803740e0053c',
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
    session.clock = () => Math.max(...library.map((digest) => digest.startMs))
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
    expect(state.fitness.run.state).toBe('holding')
    expect(state.fitness.run.steady).toBeGreaterThan(50)
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
