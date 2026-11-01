# Baseline performance and ingestion limits

Measured with `npm run benchmark:core` on Node v22.17.0, macOS arm64, Apple M1 Pro (8 logical
CPUs). The deterministic workload models five years at four workouts per week: 1,040 alternating
run/ride activities and 4.68 million 1 Hz samples. Sessions are one hour for runs, 75 minutes for
rides, with a two-hour session every eighth activity; rides mix measured and virtual power. The
script builds every digest once, records the first combine separately, then performs five combines
for each of three body/bike-mass settings. Process CPU time is reported separately from wall time.
Peak RSS is the process maximum; heap and array-buffer values are sampled after the work.

| Phase                             |     Wall time |                        Process CPU time |
| --------------------------------- | ------------: | --------------------------------------: |
| Generate and digest the library   |      1,906 ms |                                2,185 ms |
| of which, generating activities   |        694 ms |                                         |
| of which, `digestActivity`        |      1,212 ms |                                         |
| First combine                     |         50 ms |                                   88 ms |
| Five combines per setting, median | 27–28 ms each | included in 530 ms total across 15 runs |

Peak RSS was 226.3 MiB. At the final sample, V8 heap used 45.1 MiB and array buffers used 1.3 MiB.
Measured on 26 October 2026 for PR #99; each figure is the median of three runs, interleaved with
three at main 8dd5f0b, which took 2,161 ms wall and 2,436 ms CPU for the first phase. The benchmark
times the synthetic generator apart from `digestActivity`, so a rise in either shows on its own line.

The 1,293 ms this page gave from 22 October was measured at 310264a (PR #9), and still is; 37a54b4
already took about 1,760 ms. Per-sample air density (PR #14) added about 170 ms to the generator and
200 ms to digesting. Run distance bests (PR #36), splits (PR #41) and moving time (PR #60) added about
500 ms more to digesting. PR #99 removed most of the moving-time and air-density cost without
changing any digest, so digesting alone fell from about 1,470 ms to 1,212 ms. Since 23 October a
combine has fallen from 60 ms to 27 ms, because each comparison quantity is now sorted once.

Output at the same heart rate (`sameHeartRate`, docs/research/same-heart-rate.md) is worked out beside
the combine, not inside it, and does not read body mass, so a change of weight does not redo it. Each reported
week fits at most 48 blocks by Theil-Sen and resamples the activities 200 times, which costs about 0.9 ms of
CPU. For a 3,000-activity library, the default 12 weeks took about 16 ms of CPU and all time, which reports the
newest 52 weeks of each sport, took about 66 ms. The last few periods are kept, so picking one shown before costs nothing. A first version that sorted every draw's blocks with a comparator and
took up to 100 blocks needed about 510 ms of wall time for all time. Measured on 27 October 2026, the fastest of twelve runs of a synthetic library of
eight activities a week, alternating sport, 15 steady blocks each. `npm run test:perf` holds 100 ms and 400 ms
for the two cases.

The change test (`changeEvidence`, docs/design/change-test.md) is worked out beside the combine for a period that has one
before it. It reads each activity of the two periods once at each of the 21 curve lengths, then deals the pooled efforts at
random 2,000 times per sport and length, finding the best of each side by walking the pooled ranks from the top until both
sides have appeared (a few steps a deal, no sort). For a library of 2,000 activities, a year against the year before took about
12 ms (fastest of seven); the last period is kept, so asking again costs a comparison of two lists. `npm run test:perf` holds 100 ms and 2 ms.
It reads the same prices as the curves, so a change of weight redoes it with them.

A combine prices ride equivalents at the six cross-sport durations only; the grade-by-duration chart
prices its extra durations once per result, in the page. `combine.perf.test.ts` holds a combine of a
1,000-activity library under 90 ms (fastest of seven): three times the 30 ms it takes locally, since a CI
runner took 46 ms. It catches a gross regression on any runner; the benchmark tracks smaller ones.

## A library of 2,000 activities

Measured on 28 October 2026 at main aaf79118 and at this change, interleaved, taking the fastest of four
processes of the fastest of several runs each; the machine was shared, so the figures carry about
10% of noise. The library is 2,000 synthetic activities (ten a week for about four years, the benchmark's
mix) and, beside it, a real multi-year export of about 2,000 activities. Both give the
same shapes. Everything below runs in the worker; nothing in it is on the main thread.

| Work, 2,000 synthetic activities            |          Before |           After |
| ------------------------------------------- | --------------: | --------------: |
| `combine`, all time                         |           36 ms |           17 ms |
| `combine`, 6 weeks                          |           23 ms |            8 ms |
| Load and analyse, default 12 weeks          |           49 ms |           30 ms |
| Load and analyse, all time                  |          153 ms |          104 ms |
| Switch to 6 weeks / 12 months (first time)  |     31 / 114 ms |      15 / 84 ms |
| Change of body mass, all time               |           50 ms |           23 ms |
| Toggle the age-graded trend                 |           51 ms |           18 ms |
| `sameHeartRate`, all time                   |           97 ms |           76 ms |
| `recordHolders`                             |          3.5 ms |          1.4 ms |
| State posted for all time, structured clone | 2.3 MB, 14.7 ms | 1.8 MB, 11.8 ms |

The real export gives the same picture, with each of these about as large as the synthetic figure or smaller.

What did not change, and what it costs. Digesting is 2.8 ms an activity (measured at aaf79118, before the later digest changes). Reading 2,000 digests back from
storage with `parseDigest` is 54 ms (a little more for the real ones), and the schema check each stored digest passes
when the account's library is listed adds 130 ms, both while the page waits for the network. Importing is linear, 5.7 ms an activity
from FIT files at 400 and at 2,000, and a real export of about 2,000 activities took under 30 s of wall time, with no step that grows faster than the library. Its largest costs are FIT decoding (the
per-message `Map`) and inflate, in that order; reusing the `Map` was tried and gave nothing measurable. The
trace of a 48-hour file builds in 1 ms and takes 10 ms to check when stored or read. The weekly volume strip,
late-effort evidence and distribution merge each take under 1 ms for 2,000 activities.

What changed: the 4,000 prior draws are ordered by a radix sort on their bits, not a comparison (a combine
did so 26 times), which is the order the comparison gave; the trend and the same-heart-rate weeks find their
windows by binary search; each run ceiling is worked out once per duration; an activity's summary is made
once, so the period's activities and the library list are the same objects and a clone sends them once; the
FIT checksum is read a byte at a time. Every state and analysis on both libraries is equal, as JSON, before and
after. Left alone: the same-heart-rate fit (a Theil-Sen of up to 48 blocks for each of 52 weeks and 200
resamples, now 76 ms for all time) is the one large cost left, and it is worked out even on the Balance page,
which does not show it; computing it when a sport page asks, as the age-graded trend is, would halve a first
switch to a long period, but changes what the page shows while it waits.

`npm run test:perf` holds the 2,000-activity loads and the mass change (`sessionLibrary.perf.test.ts`:
300, 80 and 80 ms), late-effort evidence (20 ms), the distribution merge (15 ms), a 48-hour trace (6 ms to
build, 50 ms to check), 200 workbench captures (30 ms), the weekly volume strip (15 ms), the heart-rate set-aside of 2,000 activities (`setAside.perf.test.ts`, 400 ms),
the low-heart-rate test of the longest file (`lowHeartRate.perf.test.ts`, 120 ms), the heart rate that reads low
for the power across 2,000 activities (`lowForPower.perf.test.ts`, 60 ms), time in zones for 2,000 activities
(`periodTime.perf.test.ts`, 50 ms), the threshold over time for 2,000 activities (`thresholdTimeline.perf.test.ts`, 30 ms), and that the radix
order takes under two thirds of the comparison's time. Each is the fastest of several runs, three to twenty
times the local figure.

The pace and power zones follow the athlete's fitness: an estimated threshold is the fit over the half year before each
week (`thresholdTimeline`), worked out once with the library's heart-rate judgement and cached with it, so changing the
period costs nothing. A first version merged every digest of the half year for each of the weeks an activity enters or
leaves it, 36 ms for 2,000 activities (ten a week, four years), and a body-mass change cost 43 ms against 34 ms before; the window's best now
moves with the weeks, each digest priced once and pushed and popped once, and it takes 2.7 ms. What a mass change does not
change is kept: the reference heart rates (they read only the digests, and each step of the set-aside iteration is kept) and
the run's steps (a run's efforts are priced from its pace alone). A date is read as a number, not formatted. A library load is now 95 ms (all time, 90 before), 30 ms (default 12 weeks, 28 before), and a
change of body mass 33 ms (32 before), the rest being the zones by week in the time in zones.
Measured on 29 October 2026, the fastest of several runs on a shared machine, alternating with main.

These values are a local reference point, not CI thresholds. This is a Node CPU benchmark of
generated activities and digest combination; it does not measure browser startup/rendering, FIT
decoding, archive extraction, or account/network latency.

The current default import ceilings are:

| Limit                                                                                |         Ceiling |
| ------------------------------------------------------------------------------------ | --------------: |
| Source bytes                                                                         |           2 GiB |
| One activity entry, or its final decompressed bytes (a nested ZIP is not held whole) |          64 MiB |
| Total bytes emitted by decompressors for one source, including nested ZIPs           |           2 GiB |
| Activity entries (FIT, GPX or TCX) per source                                        |          10,000 |
| ZIP headers per source, including ignored/non-FIT entries                            |         100,000 |
| Retained ZIP output while streaming                                                  |         128 MiB |
| FIT bytes passed to the parser                                                       |          64 MiB |
| Record messages per FIT file                                                         |       2,000,000 |
| One activity's 1 Hz grid (48 hours)                                                  | 172,800 samples |
| Grid samples per file, summed over its activities                                    | 172,800 samples |

Archive processing slices input to decompressors into 16 KiB chunks and delivers completed FIT
activities before continuing. The source and aggregate ceilings bound total import work; entry,
buffer, parser, and grid ceilings bound per-activity memory. Override defaults in tests or trusted
callers through `ExtractLimits` and `ParseLimits`.

The input is fed to each decompressor in 16 KiB slices, including ZIP output sent to nested gzip
decoders. A source stream may already have allocated a larger chunk before the importer can
inspect and slice it. fflate can also expand a compressed slice internally before invoking its
output callback, so configured decompressed-byte ceilings bound retained and accepted output but
do not strictly cap that one transient callback allocation. Production FIT parsing uses the
in-house scanner and decoder: it visits messages as it reads them and stops when it sees more than
two million record messages. It still retains accepted decoded records for later activity
processing, bounded by the record and file-byte limits. The Garmin FIT SDK is a development-only
reference used by differential tests and is not part of the production bundle. These are remaining
implementation limits; streaming decoded records directly into per-activity processing would
further reduce retained intermediate data.

## Memory of a large import in a phone-sized browser

`apps/web/e2e/phone-memory.spec.ts` (RCA-054) imports 560 synthetic runs and rides in the Pixel 7 Chromium project
(full Chromium, not the headless shell) and takes two readings.

The gate is what the import keeps. `measureUserAgentSpecificMemory` collects garbage and counts what the page and its
worker still reach, typed arrays included; the test serves its own page cross-origin isolated, which the API needs, and
leaves the app alone. The budget is 0.035 MiB an activity. Sixteen runs read 0.019 to 0.024, the spread being the idle page
itself. A build that kept every parsed activity read 0.22 in eight runs, and one that kept only the speed stream of each
read 0.054 in three, so both fail.

The blunt reading is the peak resident set of the renderer, read with `ps`: at most 320 MiB above the idle page. Thirteen
runs read 198 to 260 MiB, about 0.4 MiB an activity, which puts the audit's 2,000 activities near 1 GiB (the audit
measured about 1 GiB on a real export). It moves 20 percent between runs and cannot tell the kept-everything build
(191 to 389 MiB) from a clean one, so it catches only a gross change. It is read from /proc on Linux and with `ps`
elsewhere, and it is asserted off CI only: the Linux container's spread has not been measured, so CI logs the figure. The renderer runs with a 768 MiB V8 old-space cap, which makes it collect as a small device
does; without it the same import reads 2.5 MiB an activity, which is the collector being lazy. WebKit has no memory API,
so it is not measured. The structural caps and the streaming of the CSV fields and skipped zip entries that the finding
also asks for are not in this test.

This benchmark covers local digest construction and combination, not Cloudflare D1 or R2 request
costs, latency, or quota behavior. Production per-user retention limits and app-wide R2 byte and
operation budgets are documented in [PRODUCTION.md](PRODUCTION.md); they do not constrain direct
bucket access outside the application.
