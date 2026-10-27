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

These values are a local reference point, not CI thresholds. This is a Node CPU benchmark of
generated activities and digest combination; it does not measure browser startup/rendering, FIT
decoding, archive extraction, or account/network latency.

The current default import ceilings are:

| Limit                                                                      |         Ceiling |
| -------------------------------------------------------------------------- | --------------: |
| Source bytes                                                               |           2 GiB |
| One ZIP entry or final decompressed activity                               |          64 MiB |
| Total bytes emitted by decompressors for one source, including nested ZIPs |           2 GiB |
| Activity entries (FIT, GPX or TCX) per source                              |          10,000 |
| ZIP headers per source, including ignored/non-FIT entries                  |         100,000 |
| Retained ZIP output while streaming                                        |         128 MiB |
| FIT bytes passed to the parser                                             |          64 MiB |
| Record messages per FIT file                                               |       2,000,000 |
| One activity's 1 Hz grid (48 hours)                                        | 172,800 samples |
| Grid samples per file, summed over its activities                          | 172,800 samples |

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

This benchmark covers local digest construction and combination, not Cloudflare D1 or R2 request
costs, latency, or quota behavior. Production per-user retention limits and app-wide R2 byte and
operation budgets are documented in [PRODUCTION.md](PRODUCTION.md); they do not constrain direct
bucket access outside the application.
