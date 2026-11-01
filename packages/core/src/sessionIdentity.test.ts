import { describe, expect, it } from 'vitest'
import { setViewerZone } from './calendar'
import type { Zone } from './calendar'
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
 * Added the `lookBack` field (each sport's years in hindsight and its bests over the years, library-wide): a new key under every period,
 * the same under all four, and no existing hash moves. The 400-activity library is too short to tell years, so what it pins is the
 * too-short statement and the bests of its efforts; they depend on the body mass (a ride is priced in W/kg with dated masses), so the
 * fixed setting has its own hash, and the dated ones are cut in the zone they are taken in (Auckland's is its own; UTC and Los Angeles agree). The look-back is read from the runs and rides the card is, power set aside included.
 *
 * Re-pinned for the other sport that set a reference (D1 wording). `EffortCheck` gains `rideReferenceFrom` / `runReferenceFrom`, present only
 * where the activities gave a sport a reference the other sport set (cycling's is running's less 6 bpm), so the chip and the card can say so.
 * Moved, and only through that field: `result` (its `effort` entries) and `previous` (its `headlineEffort`). In the 400-activity library, under the
 * fixed UTC setting only (3 `previous` and 4 `result` hashes); in the set-aside library, under all four settings (4 `previous` and 16 `result`). Every other field is as it was.
 *
 * Re-pinned for the bests-over-time dots and the effort gate (D5.5, RCA-007). The dots leave out an effort heart rate shows was not
 * hard, so the weekly points over the period change: `trend` and `effortTrends`, and only the 400-activity library (16 hashes each: the
 * four settings under every period). The new `dotsWithheld` field is not hashed. The curves' bests, the change test and the set-aside
 * library are as they were.
 *
 * Re-pinned for revision 7 (D12 F), the release that writes the changes that were gated behind it, and makes weeks local Mondays.
 * Two things move, and the state is taken as the app takes it: in the process's zone, which the session is given as its viewer's
 * (`inZone` below), so the days of a period and of a dated setting are cut where they always were.
 * (1) The digests of the 400-activity library's 24 generated templates (12 runs): every run's `splits` move (the split ratio against
 * the speed stream, and a steep descent's smaller credit), three of them (templates 2, 14 and 20, on a climb) move their `curve`,
 * `hrBlocks` and `drift`, template 8 its `curve`, `hrBlocks` and `durability`, as a descent now costs more; the rides do not move.
 * No template has a temperature, a label, a local time or a run of 42 km, so none of those fields appears. Under every period and
 * setting that moves ten fields of this library: `result`, `trend`, `effortTrends`, `lookBack`, `previous`, `change`,
 * `sameHeartRate`, `lateEvidence`, `heartRateJudgement` and `fitness`. `zoneEstimates`, `timeInZones` and `records` do not move for it
 * in UTC. The set-aside library is made from the sample dataset, whose digests move only in the splits of six runs, which no field
 * it pins reads, so it does not move in UTC.
 * (2) The weeks are cut at local Mondays, in the viewer's zone (no file here records a shift, so the zone says). The 400-activity
 * library's runs start at 07:00 UTC, which is Sunday 23:00 in Los Angeles: every run's week moves there, and with it `zoneEstimates`
 * (the thresholds by week), `trend` and the `all` period's `timeInZones`. In Auckland that library does not move (07:00 UTC is 20:00 the
 * same day). The set-aside library's activities start at other hours and move in Auckland: `trend`, `effortTrends`, `heartRateJudgement`,
 * `zoneEstimates`, `sameHeartRate` and the `all` period's `timeInZones`. Each of these was checked as a week assignment by
 * calendar.sites.test.ts and calendar.windows.test.ts, which put a Sunday evening in its own week.
 *
 * Re-pinned for the resolved default period (A1). The default is the shortest of 12 weeks, 26 weeks and 12 months where every sport
 * has 3 activities and a best 20 min not shown easy, else all time, so a library whose 12 weeks hold a hard effort in both sports is
 * as it was. The 400-activity library is: no hash moves. The set-aside library has one recent ride, so no window has 3 rides and its
 * default is all time: under all four settings its default `result`, `trend`, `effortTrends`, `sameHeartRate`, `lateEvidence` and
 * `timeInZones` are now the `all` period's, and its `period` is `all`'s dates with the choice kept as 'default' and `fellBack` set (the
 * 12 weeks it had before were the old period of two sports, one of them a single ride). `heartRateJudgement`, `fitness`, `lookBack`,
 * `zoneEstimates`, `previous`, `change`, `records` and `library` are as they were (all time has no previous period, and the set-aside
 * library's 12 weeks had none either). The new `answerWindow` field is not hashed (window.test.ts and sessionWindow.test.ts pin it).
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
    '"default"/result': 'e80f5321e85f57ee',
    '"default"/trend': '73c68a09a291025d',
    '"default"/effortTrends': '2069e4bc012733e2',
    '"default"/sameHeartRate': '70e621421815d33b',
    '"default"/lateEvidence': '82c31a87fd5eab33',
    '"default"/heartRateJudgement': '6c6863cb5adcf709',
    '"default"/fitness': '12f8dc16be041382',
    '"default"/lookBack': 'a5532ce28200f62c',
    '"default"/zoneEstimates': 'de94f0e550ef0830',
    '"default"/timeInZones': 'bc835390d8785729',
    '"default"/previous': '98d9495c49501b9d',
    '"default"/change': 'e1d0ab80aeb5389f',
    '"default"/records': 'e230de84b581960a',
    '"default"/library': '574d46370edbd9ae',
    '"default"/period': '6f360d1647ca0139',
    '"all"/result': '7394f14427a070a4',
    '"all"/trend': '3e4a0e16536cfa74',
    '"all"/effortTrends': '8ace7b8bb19a28c3',
    '"all"/sameHeartRate': '9b1187fdeee130f6',
    '"all"/lateEvidence': 'c7bfe4c6b32ebc3d',
    '"all"/heartRateJudgement': '6c6863cb5adcf709',
    '"all"/fitness': '12f8dc16be041382',
    '"all"/lookBack': 'a5532ce28200f62c',
    '"all"/zoneEstimates': 'de94f0e550ef0830',
    '"all"/timeInZones': 'ba07d4f13e976077',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e230de84b581960a',
    '"all"/library': '574d46370edbd9ae',
    '"all"/period': '47579e1a1fbdd02b',
    '42/result': 'ab0d22551163159e',
    '42/trend': '7c995925729427f7',
    '42/effortTrends': '35e9638e18ad68e2',
    '42/sameHeartRate': '1646cd607789eeb4',
    '42/lateEvidence': '669deb50b08ed81c',
    '42/heartRateJudgement': '6c6863cb5adcf709',
    '42/fitness': '12f8dc16be041382',
    '42/lookBack': 'a5532ce28200f62c',
    '42/zoneEstimates': 'de94f0e550ef0830',
    '42/timeInZones': '684dbf01344ec1d1',
    '42/previous': '8317352ad56c8646',
    '42/change': '0098612a65466b38',
    '42/records': 'e230de84b581960a',
    '42/library': '574d46370edbd9ae',
    '42/period': 'f52586cd25d95522',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': '471899f39ce4ecb2',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': 'e8f310f4afc0e52a',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': '54b7e8676ce637da',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': 'cc847208ae91fbcb',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '16e4fb7658543f31',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': '6c6863cb5adcf709',
    '{"from":"2021-03-10","to":"2021-03-20"}/fitness': '12f8dc16be041382',
    '{"from":"2021-03-10","to":"2021-03-20"}/lookBack': 'a5532ce28200f62c',
    '{"from":"2021-03-10","to":"2021-03-20"}/zoneEstimates': 'de94f0e550ef0830',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': '9cc0c656681e65d9',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '4c0013f6702c10ba',
    '{"from":"2021-03-10","to":"2021-03-20"}/change': '56228df225a10af6',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': 'e230de84b581960a',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '574d46370edbd9ae',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '96d95e57a4633ca0',
  },
  'dated in UTC': {
    '"default"/result': '51b2a8db99aa799d',
    '"default"/trend': '5ca381ef25c48d71',
    '"default"/effortTrends': 'bb18550103421240',
    '"default"/sameHeartRate': '70e621421815d33b',
    '"default"/lateEvidence': '75335e09f103af0c',
    '"default"/heartRateJudgement': 'e43c5068063f92a6',
    '"default"/fitness': '12f8dc16be041382',
    '"default"/lookBack': '6dee0d8f6203a604',
    '"default"/zoneEstimates': '0a3ad93d0a53eb5d',
    '"default"/timeInZones': '54c30cf4c9ba2cd0',
    '"default"/previous': 'f5ac0c765c904868',
    '"default"/change': '5926dd09b0a9fe30',
    '"default"/records': '45d6f3b6516eb072',
    '"default"/library': '4915398ed45b1efd',
    '"default"/period': '6f360d1647ca0139',
    '"all"/result': 'a36481b168200aa4',
    '"all"/trend': 'fbc97920f1b7704a',
    '"all"/effortTrends': 'dab76535f66d312c',
    '"all"/sameHeartRate': '6c17b634cd6cfb32',
    '"all"/lateEvidence': '2c42eb05bebc7804',
    '"all"/heartRateJudgement': 'e43c5068063f92a6',
    '"all"/fitness': '12f8dc16be041382',
    '"all"/lookBack': '6dee0d8f6203a604',
    '"all"/zoneEstimates': '0a3ad93d0a53eb5d',
    '"all"/timeInZones': '0a96b61cd3761a12',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': '45d6f3b6516eb072',
    '"all"/library': '4915398ed45b1efd',
    '"all"/period': '47579e1a1fbdd02b',
    '42/result': 'cb5134a86d06711f',
    '42/trend': '4836106d74c8038a',
    '42/effortTrends': 'c148c8941aba2904',
    '42/sameHeartRate': '1646cd607789eeb4',
    '42/lateEvidence': '9b0bd682f3adefd5',
    '42/heartRateJudgement': 'e43c5068063f92a6',
    '42/fitness': '12f8dc16be041382',
    '42/lookBack': '6dee0d8f6203a604',
    '42/zoneEstimates': '0a3ad93d0a53eb5d',
    '42/timeInZones': '2df256f9939609a7',
    '42/previous': '848198debfa55022',
    '42/change': '0098612a65466b38',
    '42/records': '45d6f3b6516eb072',
    '42/library': '4915398ed45b1efd',
    '42/period': 'f52586cd25d95522',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': '313fc83df33186ef',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': 'b88fa9d3e44b6695',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': 'a40bc36685636630',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': 'cc847208ae91fbcb',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '234332901e673313',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': 'e43c5068063f92a6',
    '{"from":"2021-03-10","to":"2021-03-20"}/fitness': '12f8dc16be041382',
    '{"from":"2021-03-10","to":"2021-03-20"}/lookBack': '6dee0d8f6203a604',
    '{"from":"2021-03-10","to":"2021-03-20"}/zoneEstimates': '0a3ad93d0a53eb5d',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': 'ec5fef81637b4f3f',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '9a8c8394727de97d',
    '{"from":"2021-03-10","to":"2021-03-20"}/change': '56228df225a10af6',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '45d6f3b6516eb072',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '4915398ed45b1efd',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '96d95e57a4633ca0',
  },
  'dated in Los Angeles': {
    '"default"/result': '51b2a8db99aa799d',
    '"default"/trend': '5ca381ef25c48d71',
    '"default"/effortTrends': 'bb18550103421240',
    '"default"/sameHeartRate': '70e621421815d33b',
    '"default"/lateEvidence': '75335e09f103af0c',
    '"default"/heartRateJudgement': '337b186008af293c',
    '"default"/fitness': 'bb040990b6ac531d',
    '"default"/lookBack': '6dee0d8f6203a604',
    '"default"/zoneEstimates': 'fe0e47e5286ff8c2',
    '"default"/timeInZones': '54c30cf4c9ba2cd0',
    '"default"/previous': 'f5ac0c765c904868',
    '"default"/change': '5926dd09b0a9fe30',
    '"default"/records': '45d6f3b6516eb072',
    '"default"/library': '4915398ed45b1efd',
    '"default"/period': '7cbdf77a690f6297',
    '"all"/result': 'a36481b168200aa4',
    '"all"/trend': '1bfdce975e38b0c7',
    '"all"/effortTrends': 'f9eb8e8208735469',
    '"all"/sameHeartRate': 'f2fa1fd74d3f1fab',
    '"all"/lateEvidence': '2c42eb05bebc7804',
    '"all"/heartRateJudgement': '337b186008af293c',
    '"all"/fitness': 'bb040990b6ac531d',
    '"all"/lookBack': '6dee0d8f6203a604',
    '"all"/zoneEstimates': 'fe0e47e5286ff8c2',
    '"all"/timeInZones': '7bf53c6085b916ae',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': '45d6f3b6516eb072',
    '"all"/library': '4915398ed45b1efd',
    '"all"/period': 'b4022d2b20f6cb24',
    '42/result': 'cb5134a86d06711f',
    '42/trend': '4836106d74c8038a',
    '42/effortTrends': 'c148c8941aba2904',
    '42/sameHeartRate': '1646cd607789eeb4',
    '42/lateEvidence': '9b0bd682f3adefd5',
    '42/heartRateJudgement': '337b186008af293c',
    '42/fitness': 'bb040990b6ac531d',
    '42/lookBack': '6dee0d8f6203a604',
    '42/zoneEstimates': 'fe0e47e5286ff8c2',
    '42/timeInZones': '2df256f9939609a7',
    '42/previous': '848198debfa55022',
    '42/change': '0098612a65466b38',
    '42/records': '45d6f3b6516eb072',
    '42/library': '4915398ed45b1efd',
    '42/period': 'ee8d1f6b756898a2',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': '1f46eed2ba6be67d',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': 'b88fa9d3e44b6695',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': 'a40bc36685636630',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': 'cc847208ae91fbcb',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '42742faed5a266c6',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': '337b186008af293c',
    '{"from":"2021-03-10","to":"2021-03-20"}/fitness': 'bb040990b6ac531d',
    '{"from":"2021-03-10","to":"2021-03-20"}/lookBack': '6dee0d8f6203a604',
    '{"from":"2021-03-10","to":"2021-03-20"}/zoneEstimates': 'fe0e47e5286ff8c2',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': 'd31af9c49d1601f0',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '9a8c8394727de97d',
    '{"from":"2021-03-10","to":"2021-03-20"}/change': '8c46ce8a6c7f91cd',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '45d6f3b6516eb072',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '4915398ed45b1efd',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': '7de40011ebc2b6a9',
  },
  'dated in Auckland': {
    '"default"/result': '5d82fb008b0b0352',
    '"default"/trend': '5ca381ef25c48d71',
    '"default"/effortTrends': 'bb18550103421240',
    '"default"/sameHeartRate': '97c42fb24d83ac3f',
    '"default"/lateEvidence': '75335e09f103af0c',
    '"default"/heartRateJudgement': '1a85b0c1f70c856c',
    '"default"/fitness': '6d1e429e16b4d452',
    '"default"/lookBack': '9997b059d200918f',
    '"default"/zoneEstimates': '5b5be0cc1f06bcbe',
    '"default"/timeInZones': '54c30cf4c9ba2cd0',
    '"default"/previous': 'f5ac0c765c904868',
    '"default"/change': '5926dd09b0a9fe30',
    '"default"/records': '45d6f3b6516eb072',
    '"default"/library': '1038bb267703371b',
    '"default"/period': 'c102373861471840',
    '"all"/result': 'dbf5e38876b65fab',
    '"all"/trend': 'fbc97920f1b7704a',
    '"all"/effortTrends': 'dab76535f66d312c',
    '"all"/sameHeartRate': 'a0318d07ffb489d1',
    '"all"/lateEvidence': '2c42eb05bebc7804',
    '"all"/heartRateJudgement': '1a85b0c1f70c856c',
    '"all"/fitness': '6d1e429e16b4d452',
    '"all"/lookBack': '9997b059d200918f',
    '"all"/zoneEstimates': '5b5be0cc1f06bcbe',
    '"all"/timeInZones': '71011fbcc6ed1cea',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': '45d6f3b6516eb072',
    '"all"/library': '1038bb267703371b',
    '"all"/period': '4e2b3f99b79165f0',
    '42/result': 'e17b079189275a6b',
    '42/trend': '4836106d74c8038a',
    '42/effortTrends': 'c148c8941aba2904',
    '42/sameHeartRate': '4c49e2c4363a0e14',
    '42/lateEvidence': '9b0bd682f3adefd5',
    '42/heartRateJudgement': '1a85b0c1f70c856c',
    '42/fitness': '6d1e429e16b4d452',
    '42/lookBack': '9997b059d200918f',
    '42/zoneEstimates': '5b5be0cc1f06bcbe',
    '42/timeInZones': '2df256f9939609a7',
    '42/previous': '848198debfa55022',
    '42/change': '0098612a65466b38',
    '42/records': '45d6f3b6516eb072',
    '42/library': '1038bb267703371b',
    '42/period': '8f564f063b3bbb04',
    '{"from":"2021-03-10","to":"2021-03-20"}/result': '2280a433fe556431',
    '{"from":"2021-03-10","to":"2021-03-20"}/trend': 'b88fa9d3e44b6695',
    '{"from":"2021-03-10","to":"2021-03-20"}/effortTrends': 'a40bc36685636630',
    '{"from":"2021-03-10","to":"2021-03-20"}/sameHeartRate': 'cc847208ae91fbcb',
    '{"from":"2021-03-10","to":"2021-03-20"}/lateEvidence': '4f5471da506d4b63',
    '{"from":"2021-03-10","to":"2021-03-20"}/heartRateJudgement': '1a85b0c1f70c856c',
    '{"from":"2021-03-10","to":"2021-03-20"}/fitness': '6d1e429e16b4d452',
    '{"from":"2021-03-10","to":"2021-03-20"}/lookBack': '9997b059d200918f',
    '{"from":"2021-03-10","to":"2021-03-20"}/zoneEstimates': '5b5be0cc1f06bcbe',
    '{"from":"2021-03-10","to":"2021-03-20"}/timeInZones': '9ca2885d5b8c4d13',
    '{"from":"2021-03-10","to":"2021-03-20"}/previous': '9a8c8394727de97d',
    '{"from":"2021-03-10","to":"2021-03-20"}/change': '3bea375276e8fae2',
    '{"from":"2021-03-10","to":"2021-03-20"}/records': '45d6f3b6516eb072',
    '{"from":"2021-03-10","to":"2021-03-20"}/library': '1038bb267703371b',
    '{"from":"2021-03-10","to":"2021-03-20"}/period': 'aa4c803ea5ad72ed',
  },
}

/**
 * The state for the library of `setAsideLibrary()` (fifteen activities, where the heart-rate judgement sets one
 * activity aside whichever period is on screen), pinned when the library-wide set-aside was reviewed, at main
 * 4f4ccecb, under the same four settings and four periods, the custom range being inside that library's span.
 * Re-pinned for the level-only answer: `fitness` moves, to one new value under every period and setting, and no other field. The
 * library's run status cannot call a trend (a history shortfall, 4 steady runs), and a status in that state now carries its `level`
 * (3 or more steady activities). Taking `level` out of the two statuses gives the hash pinned before, `e06cef9524eff0b1`; the ride
 * has one steady ride and gains nothing.
 */
const PINNED_SET_ASIDE: Record<string, Record<string, string>> = {
  'fixed in UTC': {
    '"default"/result': '906593423e16f9d6',
    '"default"/trend': '17f6c339a76cf6f4',
    '"default"/effortTrends': 'a2a46e9bb614a550',
    '"default"/sameHeartRate': '524ba8e896848f76',
    '"default"/lateEvidence': 'd11d17f883ace2c8',
    '"default"/heartRateJudgement': '7945ebb2189be5cd',
    '"default"/fitness': '57d7c74f01ea35c0',
    '"default"/lookBack': '7341d7b0fe5446a0',
    '"default"/zoneEstimates': 'd1d1bfcc82885916',
    '"default"/timeInZones': '8cd4d6a93f3b7a73',
    '"default"/previous': '74234e98afe7498f',
    '"default"/change': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '9efa37e8bfb8c3d9',
    '"default"/period': '1ea974b302f40ab7',
    '"all"/result': '906593423e16f9d6',
    '"all"/trend': '17f6c339a76cf6f4',
    '"all"/effortTrends': 'a2a46e9bb614a550',
    '"all"/sameHeartRate': '524ba8e896848f76',
    '"all"/lateEvidence': 'd11d17f883ace2c8',
    '"all"/heartRateJudgement': '7945ebb2189be5cd',
    '"all"/fitness': '57d7c74f01ea35c0',
    '"all"/lookBack': '7341d7b0fe5446a0',
    '"all"/zoneEstimates': 'd1d1bfcc82885916',
    '"all"/timeInZones': '8cd4d6a93f3b7a73',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '9efa37e8bfb8c3d9',
    '"all"/period': '908d810a6805c001',
    '42/result': 'dd486e86998fce73',
    '42/trend': '8e9171f6508ccab9',
    '42/effortTrends': 'af62014c28c1452e',
    '42/sameHeartRate': '2cdb59cf7d381a18',
    '42/lateEvidence': '4047755b5bfd8e1f',
    '42/heartRateJudgement': '7945ebb2189be5cd',
    '42/fitness': '57d7c74f01ea35c0',
    '42/lookBack': '7341d7b0fe5446a0',
    '42/zoneEstimates': 'd1d1bfcc82885916',
    '42/timeInZones': '5889426e2c436d3c',
    '42/previous': '901fbbc695c9c070',
    '42/change': '01ac269c3c3ca999',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '9efa37e8bfb8c3d9',
    '42/period': '9c5c63cd365ca2ab',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': 'dce4d00db247498e',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': 'c4124cae0c6ec46f',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': '1f552e4ad0f24c5f',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': '25c037acb374ef02',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': '088a974a4edfcd71',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': '7945ebb2189be5cd',
    '{"from":"2025-04-20","to":"2025-06-03"}/fitness': '57d7c74f01ea35c0',
    '{"from":"2025-04-20","to":"2025-06-03"}/lookBack': '7341d7b0fe5446a0',
    '{"from":"2025-04-20","to":"2025-06-03"}/zoneEstimates': 'd1d1bfcc82885916',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': 'e59e3a6817dac999',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/change': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '9efa37e8bfb8c3d9',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': '040ccc203beb436c',
  },
  'dated in UTC': {
    '"default"/result': 'aaca0aecf0e0cf26',
    '"default"/trend': 'efdc06a6f31390f8',
    '"default"/effortTrends': 'd67d90b50e0b0a1c',
    '"default"/sameHeartRate': '524ba8e896848f76',
    '"default"/lateEvidence': 'd11d17f883ace2c8',
    '"default"/heartRateJudgement': 'd063a93af7c6c146',
    '"default"/fitness': '57d7c74f01ea35c0',
    '"default"/lookBack': '7341d7b0fe5446a0',
    '"default"/zoneEstimates': '469ade6105cdad8e',
    '"default"/timeInZones': '8cd4d6a93f3b7a73',
    '"default"/previous': '74234e98afe7498f',
    '"default"/change': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '8090803740e0053c',
    '"default"/period': '1ea974b302f40ab7',
    '"all"/result': 'aaca0aecf0e0cf26',
    '"all"/trend': 'efdc06a6f31390f8',
    '"all"/effortTrends': 'd67d90b50e0b0a1c',
    '"all"/sameHeartRate': '524ba8e896848f76',
    '"all"/lateEvidence': 'd11d17f883ace2c8',
    '"all"/heartRateJudgement': 'd063a93af7c6c146',
    '"all"/fitness': '57d7c74f01ea35c0',
    '"all"/lookBack': '7341d7b0fe5446a0',
    '"all"/zoneEstimates': '469ade6105cdad8e',
    '"all"/timeInZones': '8cd4d6a93f3b7a73',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '8090803740e0053c',
    '"all"/period': '908d810a6805c001',
    '42/result': '464812524927cb14',
    '42/trend': '3631a41c96a19f5f',
    '42/effortTrends': 'e4f95c6f8ec82d9a',
    '42/sameHeartRate': '2cdb59cf7d381a18',
    '42/lateEvidence': '4047755b5bfd8e1f',
    '42/heartRateJudgement': 'd063a93af7c6c146',
    '42/fitness': '57d7c74f01ea35c0',
    '42/lookBack': '7341d7b0fe5446a0',
    '42/zoneEstimates': '469ade6105cdad8e',
    '42/timeInZones': '5889426e2c436d3c',
    '42/previous': '901fbbc695c9c070',
    '42/change': '01ac269c3c3ca999',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '8090803740e0053c',
    '42/period': '9c5c63cd365ca2ab',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': '98fa33dc1a843380',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': '7806d696dcfffdc9',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': 'fb852c4a8e89752a',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': '25c037acb374ef02',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': '088a974a4edfcd71',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': 'd063a93af7c6c146',
    '{"from":"2025-04-20","to":"2025-06-03"}/fitness': '57d7c74f01ea35c0',
    '{"from":"2025-04-20","to":"2025-06-03"}/lookBack': '7341d7b0fe5446a0',
    '{"from":"2025-04-20","to":"2025-06-03"}/zoneEstimates': '469ade6105cdad8e',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': 'e59e3a6817dac999',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/change': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '8090803740e0053c',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': '040ccc203beb436c',
  },
  'dated in Los Angeles': {
    '"default"/result': 'aaca0aecf0e0cf26',
    '"default"/trend': 'efdc06a6f31390f8',
    '"default"/effortTrends': 'd67d90b50e0b0a1c',
    '"default"/sameHeartRate': '524ba8e896848f76',
    '"default"/lateEvidence': 'd11d17f883ace2c8',
    '"default"/heartRateJudgement': 'd063a93af7c6c146',
    '"default"/fitness': '57d7c74f01ea35c0',
    '"default"/lookBack': '7341d7b0fe5446a0',
    '"default"/zoneEstimates': '469ade6105cdad8e',
    '"default"/timeInZones': '8cd4d6a93f3b7a73',
    '"default"/previous': '74234e98afe7498f',
    '"default"/change': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '8090803740e0053c',
    '"default"/period': '15560ef12cf99461',
    '"all"/result': 'aaca0aecf0e0cf26',
    '"all"/trend': 'efdc06a6f31390f8',
    '"all"/effortTrends': 'd67d90b50e0b0a1c',
    '"all"/sameHeartRate': '524ba8e896848f76',
    '"all"/lateEvidence': 'd11d17f883ace2c8',
    '"all"/heartRateJudgement': 'd063a93af7c6c146',
    '"all"/fitness': '57d7c74f01ea35c0',
    '"all"/lookBack': '7341d7b0fe5446a0',
    '"all"/zoneEstimates': '469ade6105cdad8e',
    '"all"/timeInZones': '8cd4d6a93f3b7a73',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '8090803740e0053c',
    '"all"/period': '6183491011d5d5b5',
    '42/result': '464812524927cb14',
    '42/trend': '3631a41c96a19f5f',
    '42/effortTrends': 'e4f95c6f8ec82d9a',
    '42/sameHeartRate': '2cdb59cf7d381a18',
    '42/lateEvidence': '4047755b5bfd8e1f',
    '42/heartRateJudgement': 'd063a93af7c6c146',
    '42/fitness': '57d7c74f01ea35c0',
    '42/lookBack': '7341d7b0fe5446a0',
    '42/zoneEstimates': '469ade6105cdad8e',
    '42/timeInZones': '5889426e2c436d3c',
    '42/previous': '901fbbc695c9c070',
    '42/change': '01ac269c3c3ca999',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '8090803740e0053c',
    '42/period': '4115668a63751e03',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': '98fa33dc1a843380',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': '7806d696dcfffdc9',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': 'fb852c4a8e89752a',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': '25c037acb374ef02',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': '088a974a4edfcd71',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': 'd063a93af7c6c146',
    '{"from":"2025-04-20","to":"2025-06-03"}/fitness': '57d7c74f01ea35c0',
    '{"from":"2025-04-20","to":"2025-06-03"}/lookBack': '7341d7b0fe5446a0',
    '{"from":"2025-04-20","to":"2025-06-03"}/zoneEstimates': '469ade6105cdad8e',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': 'e59e3a6817dac999',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/change': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '8090803740e0053c',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': '8d270473f6fc81d0',
  },
  'dated in Auckland': {
    '"default"/result': 'aaca0aecf0e0cf26',
    '"default"/trend': '90ec69a878fd69f8',
    '"default"/effortTrends': '0b84c54a450efc1e',
    '"default"/sameHeartRate': '524ba8e896848f76',
    '"default"/lateEvidence': 'd11d17f883ace2c8',
    '"default"/heartRateJudgement': '2ef203a2ab0df205',
    '"default"/fitness': '57d7c74f01ea35c0',
    '"default"/lookBack': '7341d7b0fe5446a0',
    '"default"/zoneEstimates': '69c20ca09ea01537',
    '"default"/timeInZones': '6a401320b1146f83',
    '"default"/previous': '74234e98afe7498f',
    '"default"/change': '74234e98afe7498f',
    '"default"/records': 'e210f2b0ab4e6347',
    '"default"/library': '8090803740e0053c',
    '"default"/period': 'aeb4df8a38f78a46',
    '"all"/result': 'aaca0aecf0e0cf26',
    '"all"/trend': '90ec69a878fd69f8',
    '"all"/effortTrends': '0b84c54a450efc1e',
    '"all"/sameHeartRate': '524ba8e896848f76',
    '"all"/lateEvidence': 'd11d17f883ace2c8',
    '"all"/heartRateJudgement': '2ef203a2ab0df205',
    '"all"/fitness': '57d7c74f01ea35c0',
    '"all"/lookBack': '7341d7b0fe5446a0',
    '"all"/zoneEstimates': '69c20ca09ea01537',
    '"all"/timeInZones': '6a401320b1146f83',
    '"all"/previous': '74234e98afe7498f',
    '"all"/change': '74234e98afe7498f',
    '"all"/records': 'e210f2b0ab4e6347',
    '"all"/library': '8090803740e0053c',
    '"all"/period': 'c8bcf9bb00b45238',
    '42/result': '464812524927cb14',
    '42/trend': 'dc220b54db6a84fe',
    '42/effortTrends': '8191bcc42bc0d8fc',
    '42/sameHeartRate': '2cdb59cf7d381a18',
    '42/lateEvidence': '4047755b5bfd8e1f',
    '42/heartRateJudgement': '2ef203a2ab0df205',
    '42/fitness': '57d7c74f01ea35c0',
    '42/lookBack': '7341d7b0fe5446a0',
    '42/zoneEstimates': '69c20ca09ea01537',
    '42/timeInZones': '5889426e2c436d3c',
    '42/previous': '901fbbc695c9c070',
    '42/change': '01ac269c3c3ca999',
    '42/records': 'e210f2b0ab4e6347',
    '42/library': '8090803740e0053c',
    '42/period': '380732de5220fc6a',
    '{"from":"2025-04-20","to":"2025-06-03"}/result': '7c8a111be6666b91',
    '{"from":"2025-04-20","to":"2025-06-03"}/trend': 'd938f565492e352c',
    '{"from":"2025-04-20","to":"2025-06-03"}/effortTrends': '168a172aa297f675',
    '{"from":"2025-04-20","to":"2025-06-03"}/sameHeartRate': 'e1898a6819acce5e',
    '{"from":"2025-04-20","to":"2025-06-03"}/lateEvidence': '20558f62784c4691',
    '{"from":"2025-04-20","to":"2025-06-03"}/heartRateJudgement': '2ef203a2ab0df205',
    '{"from":"2025-04-20","to":"2025-06-03"}/fitness': '57d7c74f01ea35c0',
    '{"from":"2025-04-20","to":"2025-06-03"}/lookBack': '7341d7b0fe5446a0',
    '{"from":"2025-04-20","to":"2025-06-03"}/zoneEstimates': '69c20ca09ea01537',
    '{"from":"2025-04-20","to":"2025-06-03"}/timeInZones': '7d762c42333f4d07',
    '{"from":"2025-04-20","to":"2025-06-03"}/previous': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/change': '74234e98afe7498f',
    '{"from":"2025-04-20","to":"2025-06-03"}/records': 'e210f2b0ab4e6347',
    '{"from":"2025-04-20","to":"2025-06-03"}/library': '8090803740e0053c',
    '{"from":"2025-04-20","to":"2025-06-03"}/period': 'ece551b7dbacbdf5',
  },
}

type Env = { env: Record<string, string | undefined> }
const env = (globalThis as { process?: Env }).process!.env

/** The process's zone at an instant, minutes east of UTC: the zone the app gives the session (`session.setZone`). */
const deviceZone: Zone = (ms) => -new Date(ms).getTimezoneOffset()

/** Runs with the time zone set, as the device's, and the viewer in it; puts both back. */
async function inZone<T>(zone: string, run: () => Promise<T> | T): Promise<T> {
  const saved = env.TZ
  env.TZ = zone
  const viewer = setViewerZone(deviceZone)
  try {
    return await run()
  } finally {
    setViewerZone(viewer)
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
    expect(state.lookBack.sports.run.fitness.kind).toBe('too-short')
    expect(state.lookBack.sports.run.milestones.length).toBeGreaterThan(0)
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
