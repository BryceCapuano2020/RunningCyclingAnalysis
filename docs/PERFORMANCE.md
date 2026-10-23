# Baseline performance and ingestion limits

Measured with `npm run benchmark:core` on Node v22.17.0, macOS arm64, Apple M1 Pro (8 logical
CPUs). The deterministic workload models five years at four workouts per week: 1,040 alternating
run/ride activities and 4.68 million 1 Hz samples. Sessions are one hour for runs, 75 minutes for
rides, with a two-hour session every eighth activity; rides mix measured and virtual power. The
script builds every digest once, records the first combine separately, then performs five combines
for each of three body/bike-mass settings. Process CPU time is reported separately from wall time.
Peak RSS is the process maximum; heap and array-buffer values are sampled after the work.

| Phase                             |     Wall time |                          Process CPU time |
| --------------------------------- | ------------: | ----------------------------------------: |
| Generate and digest the library   |      1,293 ms |                                  1,522 ms |
| First combine                     |         79 ms |                                    104 ms |
| Five combines per setting, median | 60–61 ms each | included in 1,035 ms total across 15 runs |

Peak RSS was 204.8 MiB. At the final sample, V8 heap used 21.5 MiB and array buffers used 1.2
MiB. These values are a local reference point, not CI thresholds. This is a Node CPU benchmark of
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
