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
 * Re-pinned for D2 (fitness episodes and rides). Only the `fitness` hash moves, to the same new value under every period and setting,
 * for the 400-activity library (`f260e7639badadcd` to `a502de8addc41620`) and the set-aside library (`007becf60abf3550` to
 * `e06cef9524eff0b1`); every other field is as it was. Two things moved in it. Each sport's `evidence.method` gains `seasonal`
 * (null: no library here has two years of steady runs, so no season is found), which moves every status that has evidence. And
 * rides are compared (`RIDE_FITNESS_ENABLED`): the 400-activity library's ride, which was `unavailable`, is holding on 149 steady
 * rides; the set-aside library's ride is a history shortfall (1 steady ride). The run statuses are otherwise as they were
 * (checked by replaying both libraries with the episode work switched off: the same states, levels, ranges and series).
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
 * Re-pinned for the effort gate (D1). No digest moved: `trend`, `effortTrends`, `sameHeartRate`, `fitness`, `records`, `library` and
 * `period` are as they were. Moved: `result` (`effort` has an entry for every curve duration and each carries what its reference can certify
 * (`runReference`, `rideReference`); the new `effortGate`; a threshold whose best 20 minutes was not a hard effort is withheld, so `runCp`,
 * `rideCp`, their refusals ('effort'), uneven fits and `runVo2max` where the reference cannot be trusted); `previous` (its `headlineEffort`
 * carries the same two readings); `heartRateJudgement` (the new `referenceReading`; the library's `fit`s and `thresholdTimeline` steps
 * are withheld in a window whose best 20 minutes was not hard); `zoneEstimates` (the same timeline) and `timeInZones` (the zones a
 * withheld threshold no longer cuts); `lateEvidence` (each drift point carries its `share` of the reference, the new `ruler`, and a late best counts
 * only the sessions that reached a hard heart rate).
 *
 * Re-pinned for the effort reference (D1, second pass). The reference is now the maximum the athlete entered, else the age-predicted
 * one for a library of under 12 days with a heart rate, else the activities' (read for the floor by age, a typical day at the maximum,
 * and a maximum far over the age band), so `heartRateJudgement` carries `effortReference` in place of `referenceReading`, `result.effortGate`
 * carries the reference, its source, the sessions that reached a hard heart rate and a floor of the best 30 minutes (else 20), the
 * effort checks carry the source, the 20 minute effort judged is the one with the highest heart rate among those within 5% of the best,
 * and the late bests count sessions held at the hard line for two minutes where the digest has its seconds. With the library as it
 * was, `result`, `heartRateJudgement`, `lateEvidence` and `previous` moved, and `timeInZones` and `zoneEstimates` in the set-aside library.
 * Then the 400-activity library changed to the fixture's `hard` variant (`copiedLibrary(400, { hard: true })`; the default is as
 * it was, and the perf tests keep it): the templates' efforts cycle through easy, easy, tempo, easy, intervals, easy, test, easy (a
 * run and a ride each) and a test lasts two hours. Before, its runs read `habitual` (hard efforts every other day put the typical day
 * at the maximum) with a best 20 minutes at 83% of the reference, and its rides `trusted` at 82%, so every fit was withheld in
 * every pinned view; now the runs and rides have thresholds (the ride gate is unchecked: its best 20 minutes has no heart rate). Every
 * field that reads the activities moved with it (`trend`, `effortTrends`, `sameHeartRate`, `fitness`, `records`, `library` and the rest);
 * `period` did not. After the merge with D2, the 400-activity library's `fitness` is `264de0a5e04e650e` (D2 pinned `a502de8addc41620`
 * for the library without hard efforts); the set-aside library's is D2's.
 *
 * Re-pinned for the zone of the maxima (D1, after the merge with main). The reference maxima group heart rates by local day and
 * were kept per activity list whatever the zone, so a zone taken after another read that one's days: the pins of the
 * 400-activity library under Los Angeles and Auckland had been taken with the UTC dated state's maxima, and in a shuffled order
 * (or any order but the declared one) the pins failed. They are kept per zone now, and the state does not depend on the order.
 * Moved, in those two settings only and under every period: `heartRateJudgement` and `zoneEstimates` (the maxima and what the
 * threshold timeline's windows are judged by). The fixed and dated UTC states, and every other field, are as they were.
 *
 * Re-pinned for the platform (D1, CI). The change test's bands are logarithms of ratios of the efforts, and V8 computes a logarithm
 * with fused multiply-add on arm64 and without it on x64, so a band that is not exactly zero differs between a Mac and CI by one
 * unit in the last place. The 400-activity library before the effort gate had every effort tied (every band zero), and the
 * hard library does not. `change` is therefore hashed at 10 significant digits (`PLATFORM_DIGITS` in test/stateHashes.ts), and
 * only `change` moved: under the default, 42 day and custom periods, in both libraries. Nothing else is rounded.
 *
 * Re-pinned for the effort gate in the change test (D1 into D5). The change test reads each period through `hardEffortRule`: a point
 * counts when the activity's heart rate shows it was a hard effort (up to 20 minutes by its peak, beyond it by its average), or when
 * it is a sprint a 30 s heart rate cannot judge. A call is made from those readings only when both periods hold enough of them, else
 * from every effort in both (`gated` says which), so a strap worn in one period alone cannot swing a side's hard share.
 * Only `change` moved, and in every call (each gains `gated`): under the default, 42 day and custom periods of the 400-activity
 * library in all four settings (twelve hashes), whose calls also take the hard readings (68 of its 400 activities have a hard
 * effort), and under the 42 day period of the set-aside library in the dated UTC, Los Angeles and Auckland settings and the
 * fixed one (four hashes), where only the new field moves (its references are thin, so no activity is judged and every call
 * reads every effort). The curves, the analysis, `previous`, `trend`, `effortTrends`, the judgement and every other field are as
 * they were.
 *
 * Re-pinned for the matched window of the heart-rate check (D6b, RCA-002). Only the set-aside library moves, in all four settings and
 * under every period, and only two fields: `heartRateJudgement` (its `calibration`: the ratio of the two sports' heart-rate slopes is
 * now read from the days both sports were done in, widened by eight weeks, and only from three or more activities of each sport there;
 * this library's rides run for over a year where its runs span under a month) and `result` (the comparison and the equivalents read
 * that calibration). Every other field of both libraries is as it was, and the 400-activity library, whose two sports share their
 * days, does not move.
 *
 * Re-pinned for the VO2max share ramp (D6c, RCA-005). Only the 400-activity library moves, and only `result` (16 hashes: the four settings
 * under every period): `runVo2max`, which the heart-rate VO2max now takes as a weighted median over runs, a window counting for half at
 * 85% of the reference heart rate and in full at 90%, where it counted in full from 85%. Every other field of both libraries is as it was, and
 * the set-aside library does not move.
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
    '"default"/result': 'e1cf0397710caaf7',
    '"default"/trend': '7ccb6f80238f2aa7',
    '"default"/effortTrends': '5a59e33e6c00e31a',
    '"default"/sameHeartRate': '22df1c594490347d',
    '"default"/lateEvidence': 'c35890e549637508',
    '"default"/heartRateJudgement': 'aa081d7d12ebab62',
    '"default"/fitness': '264de0a5e04e650e',
    '"default"/zoneEstimates': 'de94f0e550ef0830',
    '"default"/timeInZones': 'bc835390d8785729',
    '"default"/previous': '239b29825765230b',
    '"default"/change': 'e1d0ab80aeb5389f',
    '"default"/records': 'e230de84b581960a',
    '"default"/library': '574d46370edbd9ae',
    '"default"/period': '6f360d1647ca0139',
    '"all"/result': '7a8918c01d471079',
    '"all"/trend': 'd82abb8c8f6364c8',
    '"all"/effortTrends': '3b40e22eb9c3d647',
    '"all"/sameHeartRate': 'a156cbee533e237c',
    '"all"/lateEvidence': '57db8dafd7431df8',
    '"all"/heartRateJudgement': 'aa081d7d12ebab62',
    '"all"/fitness': '264de0a5e04e650e',
    '"all"/zoneEstimates': 'de94f0e550ef0830',
    '"all"/timeInZones': 'ba07d4f13e976077',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e230de84b581960a',
    '"all"/library': '574d46370edbd9ae',
    '"all"/period': '47579e1a1fbdd02b',
    '42/result': '36e77a44bd4b2f1b',
    '42/trend': 'adc1e8cefe281f7c',
    '42/effortTrends': '7d9bc2ab66f87ea8',
    '42/sameHeartRate': 'a4da967ad8eb0e1c',
    '42/lateEvidence': '3e4d48fbebf3ee70',
    '42/heartRateJudgement': 'aa081d7d12ebab62',
    '42/fitness': '264de0a5e04e650e',
    '42/zoneEstimates': 'de94f0e550ef0830',
    '42/timeInZones': '684dbf01344ec1d1',
    '42/previous': 'e4e86c2b7cc671e4',
    '42/change': 'b9c5ee269925536e',
    '42/records': 'e230de84b581960a',
    '42/library': '574d46370edbd9ae',
    '42/period': 'f52586cd25d95522',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': '99932c51bdf0635c',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': '7a3a73c712399682',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': 'd471859599c7107d',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': 'cc847208ae91fbcb',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': 'ae62a29b4ee1354d',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': 'aa081d7d12ebab62',
    '{"from":"2021-03-10","to":"2021-03-20"}/fitness': '264de0a5e04e650e',
    '{"from":"2021-03-10","to":"2021-03-20"}/zoneEstimates': 'de94f0e550ef0830',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': '9cc0c656681e65d9',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': 'cb6f59923f461647',
    '{"from":"2021-03-10","to":"2021-03-20"}/change': '86d3dab15d73818c',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': 'e230de84b581960a',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '574d46370edbd9ae',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '96d95e57a4633ca0',
  },
  'dated in UTC': {
    '"default"/result': '5f2c9695382cdb36',
    '"default"/trend': '84c209f35bffb34c',
    '"default"/effortTrends': '6f79278cc35bd233',
    '"default"/sameHeartRate': '22df1c594490347d',
    '"default"/lateEvidence': '366eecf73fe2bfba',
    '"default"/heartRateJudgement': '39077c8a2b35b824',
    '"default"/fitness': '264de0a5e04e650e',
    '"default"/zoneEstimates': '0a3ad93d0a53eb5d',
    '"default"/timeInZones': '54c30cf4c9ba2cd0',
    '"default"/previous': '08f65c180a0c3b6c',
    '"default"/change': '5926dd09b0a9fe30',
    '"default"/records': '45d6f3b6516eb072',
    '"default"/library': '4915398ed45b1efd',
    '"default"/period': '6f360d1647ca0139',
    '"all"/result': 'ab12dc3452371a7d',
    '"all"/trend': '84f2f67a75801a28',
    '"all"/effortTrends': '0d7c9dc4ee13f5bc',
    '"all"/sameHeartRate': '104aae874dcc0f73',
    '"all"/lateEvidence': '1f7591427943c04f',
    '"all"/heartRateJudgement': '39077c8a2b35b824',
    '"all"/fitness': '264de0a5e04e650e',
    '"all"/zoneEstimates': '0a3ad93d0a53eb5d',
    '"all"/timeInZones': '0a96b61cd3761a12',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': '45d6f3b6516eb072',
    '"all"/library': '4915398ed45b1efd',
    '"all"/period': '47579e1a1fbdd02b',
    '42/result': '60627a560b884367',
    '42/trend': 'f791e8353b6a1534',
    '42/effortTrends': 'f3f678396ae6f43d',
    '42/sameHeartRate': 'a4da967ad8eb0e1c',
    '42/lateEvidence': '1c60ca68e4e9ef59',
    '42/heartRateJudgement': '39077c8a2b35b824',
    '42/fitness': '264de0a5e04e650e',
    '42/zoneEstimates': '0a3ad93d0a53eb5d',
    '42/timeInZones': '2df256f9939609a7',
    '42/previous': 'ae116e6f0a9ac5b1',
    '42/change': 'b9c5ee269925536e',
    '42/records': '45d6f3b6516eb072',
    '42/library': '4915398ed45b1efd',
    '42/period': 'f52586cd25d95522',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': '76159439889e8aeb',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': '19100794ed5c91bb',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '818f214dc83d57ff',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': 'cc847208ae91fbcb',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '880259ea5bb1001c',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': '39077c8a2b35b824',
    '{"from":"2021-03-10","to":"2021-03-20"}/fitness': '264de0a5e04e650e',
    '{"from":"2021-03-10","to":"2021-03-20"}/zoneEstimates': '0a3ad93d0a53eb5d',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': 'ec5fef81637b4f3f',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '3c34eaf0926b3798',
    '{"from":"2021-03-10","to":"2021-03-20"}/change': '86d3dab15d73818c',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '45d6f3b6516eb072',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '4915398ed45b1efd',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '96d95e57a4633ca0',
  },
  'dated in Los Angeles': {
    '"default"/result': '5f2c9695382cdb36',
    '"default"/trend': '84c209f35bffb34c',
    '"default"/effortTrends': '6f79278cc35bd233',
    '"default"/sameHeartRate': '22df1c594490347d',
    '"default"/lateEvidence': '366eecf73fe2bfba',
    '"default"/heartRateJudgement': 'f3e2e84505e1ce05',
    '"default"/fitness': '264de0a5e04e650e',
    '"default"/zoneEstimates': '5b5be0cc1f06bcbe',
    '"default"/timeInZones': '54c30cf4c9ba2cd0',
    '"default"/previous': '08f65c180a0c3b6c',
    '"default"/change': '5926dd09b0a9fe30',
    '"default"/records': '45d6f3b6516eb072',
    '"default"/library': '4915398ed45b1efd',
    '"default"/period': '7cbdf77a690f6297',
    '"all"/result': 'ab12dc3452371a7d',
    '"all"/trend': '84f2f67a75801a28',
    '"all"/effortTrends': '0d7c9dc4ee13f5bc',
    '"all"/sameHeartRate': '104aae874dcc0f73',
    '"all"/lateEvidence': '1f7591427943c04f',
    '"all"/heartRateJudgement': 'f3e2e84505e1ce05',
    '"all"/fitness': '264de0a5e04e650e',
    '"all"/zoneEstimates': '5b5be0cc1f06bcbe',
    '"all"/timeInZones': '0a96b61cd3761a12',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': '45d6f3b6516eb072',
    '"all"/library': '4915398ed45b1efd',
    '"all"/period': 'b4022d2b20f6cb24',
    '42/result': '60627a560b884367',
    '42/trend': 'f791e8353b6a1534',
    '42/effortTrends': 'f3f678396ae6f43d',
    '42/sameHeartRate': 'a4da967ad8eb0e1c',
    '42/lateEvidence': '1c60ca68e4e9ef59',
    '42/heartRateJudgement': 'f3e2e84505e1ce05',
    '42/fitness': '264de0a5e04e650e',
    '42/zoneEstimates': '5b5be0cc1f06bcbe',
    '42/timeInZones': '2df256f9939609a7',
    '42/previous': 'ae116e6f0a9ac5b1',
    '42/change': 'b9c5ee269925536e',
    '42/records': '45d6f3b6516eb072',
    '42/library': '4915398ed45b1efd',
    '42/period': 'ee8d1f6b756898a2',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': 'fde2a54d0495f9bb',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': '19100794ed5c91bb',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '818f214dc83d57ff',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': 'cc847208ae91fbcb',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '46f255705fa1ddf9',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': 'f3e2e84505e1ce05',
    '{"from":"2021-03-10","to":"2021-03-20"}/fitness': '264de0a5e04e650e',
    '{"from":"2021-03-10","to":"2021-03-20"}/zoneEstimates': '5b5be0cc1f06bcbe',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': 'd31af9c49d1601f0',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '3c34eaf0926b3798',
    '{"from":"2021-03-10","to":"2021-03-20"}/change': 'a20a321c1e81c92d',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '45d6f3b6516eb072',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '4915398ed45b1efd',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '7de40011ebc2b6a9',
  },
  'dated in Auckland': {
    '"default"/result': 'b89c66f661a166f5',
    '"default"/trend': 'a7802d0a587166ad',
    '"default"/effortTrends': '49bbfe8a9b36d2bb',
    '"default"/sameHeartRate': 'edff06eb1e7cec4d',
    '"default"/lateEvidence': '366eecf73fe2bfba',
    '"default"/heartRateJudgement': '87e836221b11ae92',
    '"default"/fitness': '264de0a5e04e650e',
    '"default"/zoneEstimates': '5b5be0cc1f06bcbe',
    '"default"/timeInZones': '54c30cf4c9ba2cd0',
    '"default"/previous': '08f65c180a0c3b6c',
    '"default"/change': '5926dd09b0a9fe30',
    '"default"/records': '45d6f3b6516eb072',
    '"default"/library': '1038bb267703371b',
    '"default"/period': 'c102373861471840',
    '"all"/result': '6addc775f42815f0',
    '"all"/trend': '7c38c5d1c2f5478a',
    '"all"/effortTrends': '627e4d57d7c12a7c',
    '"all"/sameHeartRate': '104aae874dcc0f73',
    '"all"/lateEvidence': '1f7591427943c04f',
    '"all"/heartRateJudgement': '87e836221b11ae92',
    '"all"/fitness': '264de0a5e04e650e',
    '"all"/zoneEstimates': '5b5be0cc1f06bcbe',
    '"all"/timeInZones': '71011fbcc6ed1cea',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': '45d6f3b6516eb072',
    '"all"/library': '1038bb267703371b',
    '"all"/period': '4e2b3f99b79165f0',
    '42/result': 'b1da474ac90be232',
    '42/trend': '2245adafb569e8ef',
    '42/effortTrends': 'c260e577386370ea',
    '42/sameHeartRate': '14bdbf1215b15474',
    '42/lateEvidence': '1c60ca68e4e9ef59',
    '42/heartRateJudgement': '87e836221b11ae92',
    '42/fitness': '264de0a5e04e650e',
    '42/zoneEstimates': '5b5be0cc1f06bcbe',
    '42/timeInZones': '2df256f9939609a7',
    '42/previous': 'ae116e6f0a9ac5b1',
    '42/change': 'b9c5ee269925536e',
    '42/records': '45d6f3b6516eb072',
    '42/library': '1038bb267703371b',
    '42/period': '8f564f063b3bbb04',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': 'dd62801e223c5c0d',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': '19100794ed5c91bb',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '818f214dc83d57ff',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': 'cc847208ae91fbcb',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': 'eb9091f7e5f3948b',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': '87e836221b11ae92',
    '{"from":"2021-03-10","to":"2021-03-20"}/fitness': '264de0a5e04e650e',
    '{"from":"2021-03-10","to":"2021-03-20"}/zoneEstimates': '5b5be0cc1f06bcbe',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': '9ca2885d5b8c4d13',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '3c34eaf0926b3798',
    '{"from":"2021-03-10","to":"2021-03-20"}/change': 'b240d87c72c44161',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '45d6f3b6516eb072',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '1038bb267703371b',
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
    '"default"/result': '9e06b8573dba9a67',
    '"default"/trend': '43e2ac920d762756',
    '"default"/effortTrends': 'baedb35f9cea9ec1',
    '"default"/sameHeartRate': '8babbc0295b5c8f6',
    '"default"/lateEvidence': '088a974a4edfcd71',
    '"default"/heartRateJudgement': '54e8bbf9b4a276ff',
    '"default"/fitness': 'e06cef9524eff0b1',
    '"default"/zoneEstimates': '8b8cf6fedc6d5953',
    '"default"/timeInZones': '451ede684070874b',
    '"default"/previous': '74234e98afe7498f',
    '"default"/change': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '9efa37e8bfb8c3d9',
    '"default"/period': '5c06f1b12de302f0',
    '"all"/result': '0343959a34a92e2d',
    '"all"/trend': '17f6c339a76cf6f4',
    '"all"/effortTrends': 'a2a46e9bb614a550',
    '"all"/sameHeartRate': '524ba8e896848f76',
    '"all"/lateEvidence': 'd11d17f883ace2c8',
    '"all"/heartRateJudgement': '54e8bbf9b4a276ff',
    '"all"/fitness': 'e06cef9524eff0b1',
    '"all"/zoneEstimates': '8b8cf6fedc6d5953',
    '"all"/timeInZones': '5eef9e060396a5ff',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '9efa37e8bfb8c3d9',
    '"all"/period': '908d810a6805c001',
    '42/result': '15e140e97dc4ca2f',
    '42/trend': '8e9171f6508ccab9',
    '42/effortTrends': 'af62014c28c1452e',
    '42/sameHeartRate': '2cdb59cf7d381a18',
    '42/lateEvidence': '4047755b5bfd8e1f',
    '42/heartRateJudgement': '54e8bbf9b4a276ff',
    '42/fitness': 'e06cef9524eff0b1',
    '42/zoneEstimates': '8b8cf6fedc6d5953',
    '42/timeInZones': 'da1c1750f22e56b5',
    '42/previous': '7404bd2eac191663',
    '42/change': '01ac269c3c3ca999',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '9efa37e8bfb8c3d9',
    '42/period': '9c5c63cd365ca2ab',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': '9e06b8573dba9a67',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': 'c4124cae0c6ec46f',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': '1f552e4ad0f24c5f',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': '25c037acb374ef02',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': '088a974a4edfcd71',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': '54e8bbf9b4a276ff',
    '{"from":"2025-04-20","to":"2025-06-03"}/fitness': 'e06cef9524eff0b1',
    '{"from":"2025-04-20","to":"2025-06-03"}/zoneEstimates': '8b8cf6fedc6d5953',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': '451ede684070874b',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/change': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '9efa37e8bfb8c3d9',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': '040ccc203beb436c',
  },
  'dated in UTC': {
    '"default"/result': 'a1e8f7e310aa1faf',
    '"default"/trend': '89f246bf79e2e081',
    '"default"/effortTrends': '3ef059736424533d',
    '"default"/sameHeartRate': '8babbc0295b5c8f6',
    '"default"/lateEvidence': '088a974a4edfcd71',
    '"default"/heartRateJudgement': 'c4fa4c14c5bca235',
    '"default"/fitness': 'e06cef9524eff0b1',
    '"default"/zoneEstimates': 'ef8049a77ba85d81',
    '"default"/timeInZones': '451ede684070874b',
    '"default"/previous': '74234e98afe7498f',
    '"default"/change': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '8090803740e0053c',
    '"default"/period': '5c06f1b12de302f0',
    '"all"/result': '2e2557a1de950bd3',
    '"all"/trend': 'efdc06a6f31390f8',
    '"all"/effortTrends': 'd67d90b50e0b0a1c',
    '"all"/sameHeartRate': '524ba8e896848f76',
    '"all"/lateEvidence': 'd11d17f883ace2c8',
    '"all"/heartRateJudgement': 'c4fa4c14c5bca235',
    '"all"/fitness': 'e06cef9524eff0b1',
    '"all"/zoneEstimates': 'ef8049a77ba85d81',
    '"all"/timeInZones': '5eef9e060396a5ff',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '8090803740e0053c',
    '"all"/period': '908d810a6805c001',
    '42/result': 'a1c395550772e705',
    '42/trend': '3631a41c96a19f5f',
    '42/effortTrends': 'e4f95c6f8ec82d9a',
    '42/sameHeartRate': '2cdb59cf7d381a18',
    '42/lateEvidence': '4047755b5bfd8e1f',
    '42/heartRateJudgement': 'c4fa4c14c5bca235',
    '42/fitness': 'e06cef9524eff0b1',
    '42/zoneEstimates': 'ef8049a77ba85d81',
    '42/timeInZones': 'da1c1750f22e56b5',
    '42/previous': '7404bd2eac191663',
    '42/change': '01ac269c3c3ca999',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '8090803740e0053c',
    '42/period': '9c5c63cd365ca2ab',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': 'a1e8f7e310aa1faf',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': '7806d696dcfffdc9',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': 'fb852c4a8e89752a',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': '25c037acb374ef02',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': '088a974a4edfcd71',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': 'c4fa4c14c5bca235',
    '{"from":"2025-04-20","to":"2025-06-03"}/fitness': 'e06cef9524eff0b1',
    '{"from":"2025-04-20","to":"2025-06-03"}/zoneEstimates': 'ef8049a77ba85d81',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': '451ede684070874b',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/change': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '8090803740e0053c',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': '040ccc203beb436c',
  },
  'dated in Los Angeles': {
    '"default"/result': 'a1e8f7e310aa1faf',
    '"default"/trend': '89f246bf79e2e081',
    '"default"/effortTrends': '3ef059736424533d',
    '"default"/sameHeartRate': '8babbc0295b5c8f6',
    '"default"/lateEvidence': '088a974a4edfcd71',
    '"default"/heartRateJudgement': 'c4fa4c14c5bca235',
    '"default"/fitness': 'e06cef9524eff0b1',
    '"default"/zoneEstimates': 'ef8049a77ba85d81',
    '"default"/timeInZones': '451ede684070874b',
    '"default"/previous': '74234e98afe7498f',
    '"default"/change': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '8090803740e0053c',
    '"default"/period': '99c03466e443beb7',
    '"all"/result': '2e2557a1de950bd3',
    '"all"/trend': 'efdc06a6f31390f8',
    '"all"/effortTrends': 'd67d90b50e0b0a1c',
    '"all"/sameHeartRate': '524ba8e896848f76',
    '"all"/lateEvidence': 'd11d17f883ace2c8',
    '"all"/heartRateJudgement': 'c4fa4c14c5bca235',
    '"all"/fitness': 'e06cef9524eff0b1',
    '"all"/zoneEstimates': 'ef8049a77ba85d81',
    '"all"/timeInZones': '5eef9e060396a5ff',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '8090803740e0053c',
    '"all"/period': '6183491011d5d5b5',
    '42/result': 'a1c395550772e705',
    '42/trend': '3631a41c96a19f5f',
    '42/effortTrends': 'e4f95c6f8ec82d9a',
    '42/sameHeartRate': '2cdb59cf7d381a18',
    '42/lateEvidence': '4047755b5bfd8e1f',
    '42/heartRateJudgement': 'c4fa4c14c5bca235',
    '42/fitness': 'e06cef9524eff0b1',
    '42/zoneEstimates': 'ef8049a77ba85d81',
    '42/timeInZones': 'da1c1750f22e56b5',
    '42/previous': '7404bd2eac191663',
    '42/change': '01ac269c3c3ca999',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '8090803740e0053c',
    '42/period': '4115668a63751e03',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': 'a1e8f7e310aa1faf',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': '7806d696dcfffdc9',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': 'fb852c4a8e89752a',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': '25c037acb374ef02',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': '088a974a4edfcd71',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': 'c4fa4c14c5bca235',
    '{"from":"2025-04-20","to":"2025-06-03"}/fitness': 'e06cef9524eff0b1',
    '{"from":"2025-04-20","to":"2025-06-03"}/zoneEstimates': 'ef8049a77ba85d81',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': '451ede684070874b',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/change': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '8090803740e0053c',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': '8d270473f6fc81d0',
  },
  'dated in Auckland': {
    '"default"/result': 'a1e8f7e310aa1faf',
    '"default"/trend': '89f246bf79e2e081',
    '"default"/effortTrends': '3ef059736424533d',
    '"default"/sameHeartRate': '8babbc0295b5c8f6',
    '"default"/lateEvidence': '088a974a4edfcd71',
    '"default"/heartRateJudgement': 'c4fa4c14c5bca235',
    '"default"/fitness': 'e06cef9524eff0b1',
    '"default"/zoneEstimates': 'ef8049a77ba85d81',
    '"default"/timeInZones': '451ede684070874b',
    '"default"/previous': '74234e98afe7498f',
    '"default"/change': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '8090803740e0053c',
    '"default"/period': '1d6877d85a5029bb',
    '"all"/result': '2e2557a1de950bd3',
    '"all"/trend': 'efdc06a6f31390f8',
    '"all"/effortTrends': 'd67d90b50e0b0a1c',
    '"all"/sameHeartRate': '524ba8e896848f76',
    '"all"/lateEvidence': 'd11d17f883ace2c8',
    '"all"/heartRateJudgement': 'c4fa4c14c5bca235',
    '"all"/fitness': 'e06cef9524eff0b1',
    '"all"/zoneEstimates': 'ef8049a77ba85d81',
    '"all"/timeInZones': '5eef9e060396a5ff',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '8090803740e0053c',
    '"all"/period': 'c8bcf9bb00b45238',
    '42/result': 'a1c395550772e705',
    '42/trend': '3631a41c96a19f5f',
    '42/effortTrends': 'e4f95c6f8ec82d9a',
    '42/sameHeartRate': '2cdb59cf7d381a18',
    '42/lateEvidence': '4047755b5bfd8e1f',
    '42/heartRateJudgement': 'c4fa4c14c5bca235',
    '42/fitness': 'e06cef9524eff0b1',
    '42/zoneEstimates': 'ef8049a77ba85d81',
    '42/timeInZones': 'da1c1750f22e56b5',
    '42/previous': '7404bd2eac191663',
    '42/change': '01ac269c3c3ca999',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '8090803740e0053c',
    '42/period': '380732de5220fc6a',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': 'df7d5519989610ae',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': 'f3b3cd57dec59a37',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': 'a2aa81bb594c69da',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': '8f9953d621f1adb4',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': '20558f62784c4691',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': 'c4fa4c14c5bca235',
    '{"from":"2025-04-20","to":"2025-06-03"}/fitness': 'e06cef9524eff0b1',
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
  const library = copiedLibrary(400, { hard: true })
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
    // The effort gate keeps a threshold only where the best 20 minutes was a hard effort: the library must have one, or the
    // pins would say nothing of the fits, the zones cut from them or the predictions.
    expect(state.result!.effortGate.run).toMatchObject({ verdict: 'hard', reference: 'trusted' })
    expect(state.result!.runCp).not.toBeNull()
    expect(state.result!.rideCp).not.toBeNull()
    expect(state.heartRateJudgement.thresholdTimeline.run.some((step) => step.fit !== null)).toBe(
      true,
    )
    expect(state.result!.equivalents.length).toBeGreaterThan(0)
    expect(state.fitness.run.state).toBe('holding')
    expect(state.fitness.run.steady).toBeGreaterThanOrEqual(40)
    expect(state.library).toHaveLength(400)
  })

  it('gives the same state in a zone whichever zone the process worked in before', async () => {
    // The maxima group heart rates by local day and are kept per activity list: they must be kept per zone too, or a
    // zone taken after another reads that one's days, and the pins hold only in the order the tests run.
    const own = copiedLibrary(400, { hard: true })
    await inZone('America/Los_Angeles', () => stateHashes(own, ['all'], DATED))
    const hashes = await inZone('UTC', () => stateHashes(own, ['all'], DATED))
    for (const field of ['heartRateJudgement', 'zoneEstimates'] as const) {
      expect(hashes[`"all"/${field}`]).toBe(PINNED['dated in UTC']![`"all"/${field}`])
    }
  })

  it('prices rides at all three dated masses, which change inside the library', () => {
    const session = new AnalysisSession()
    session.choosePeriod('all')
    const { trend } = session.loadDigests(library, DATED)
    const masses = new Set(trend.map((point) => point.rideMassKg).filter((kg) => kg !== undefined))
    expect([...masses].sort()).toEqual([71, 76, 82])
  })
})
