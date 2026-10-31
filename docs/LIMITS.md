# Import and digest limits

What a file, an archive or a digest may ask of the app, and what happens when it asks for more. The
service limits (accounts, bytes, rate limits and Cloudflare's free tier) are in
[apps/api/LIMITS.md](../apps/api/LIMITS.md).

Every limit here is a named constant, in `packages/core/src/import/limits.ts` for files and archives
and `packages/core/src/digest/readLimits.ts` for digests, with two older groups that stay where they
are (`DEFAULT_PARSE_LIMITS` in `import/result.ts` and `DEFAULT_EXTRACT_LIMITS` in `fit/extractLimits.ts`).
`apps/web/src/limitsDoc.test.ts` fails when a value below is not the value in the code, or a
constant has no row, so this page cannot drift.

The aim of each limit is the same: a hostile or damaged input costs the importer about the size of
the input and no more, and a real file is nowhere near it. A file past a limit is refused with a
reason the athlete can read, and the rest of the import carries on. Nothing here reads, stores or
sends anything new.

## Files: XML (GPX and TCX)

Enforced by the scanner in `xml/parse.ts`, which refuses a document as one that is not GPX or TCX.
Each check runs before the text is copied or its references decoded.

| Constant                         | Value      | What it bounds                                                                                                      |
| -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `MAX_XML_DEPTH`                  | 64         | Element nesting; the root is depth 1                                                                                |
| `MAX_XML_NODES`                  | 3,000,000  | Elements, attributes and non-blank text runs when a tree is built                                                   |
| `MAX_XML_SCAN_NODES`             | 20,000,000 | The same count when the document is only scanned, as GPX and TCX are                                                |
| `MAX_XML_ATTRIBUTES_PER_ELEMENT` | 64         | Attributes on one element. A trackpoint has two                                                                     |
| `MAX_XML_NAME_CHARS`             | 256        | Characters of an element or attribute name, namespace included                                                      |
| `MAX_XML_TEXT_RUN_CHARS`         | 1,048,576  | Characters of one run of text or CDATA, before references are decoded (1 MiB). Real runs are indentation or numbers |
| `MAX_XML_ATTRIBUTE_CHARS`        | 65,536     | Characters of one attribute value, before decoding (64 KiB)                                                         |

## Files: GPX and TCX structure

Enforced by the readers in `gpx/parse.ts` and `tcx/parse.ts`. A file past one is refused with the
code `too-much-data` and a reason that says to split it. The points in a file are bounded by
`maxRecordMessages` below.

| Constant             | Value  | What it bounds                                                                                                                                      |
| -------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MAX_GPX_TRACKS`     | 1,000  | `trk` elements in one GPX file. A route collection with more is split before import                                                                 |
| `MAX_TCX_ACTIVITIES` | 1,000  | `Activity` elements in one TCX file                                                                                                                 |
| `MAX_TCX_LAPS`       | 10,000 | `Lap` elements in one TCX file, over all its activities                                                                                             |
| `MAX_FIELD_CHARS`    | 1,024  | Characters kept of a text field (a name, a time, a value) while a file is read. A longer one is cut, so a hostile field does not grow with the file |

## Files: the Strava activity list (CSV)

Enforced by `import/csv.ts` and `import/activitiesCsv.ts`. A list past a limit is malformed, so it
names no files and every file is read without the names it gave. A field is cut from the text in
slices, never built a character at a time, so a field costs about its own length however it is written.

| Constant                  | Value      | What it bounds                                                                                 |
| ------------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `MAX_ACTIVITY_LIST_BYTES` | 33,554,432 | Bytes the list may inflate to (32 MiB)                                                         |
| `MAX_CSV_CELLS_PER_ROW`   | 256        | Cells in one row. A row of commas is a cell per byte, so the byte cap does not bound the cells |
| `MAX_CSV_FIELD_CHARS`     | 65,536     | Characters in one field (64 KiB). A real field is a name, a path or a note                     |

## Files: one file

`DEFAULT_PARSE_LIMITS`, applied to every FIT, GPX and TCX file after it is inflated.

| Field                | Value      | What it bounds                                                       |
| -------------------- | ---------- | -------------------------------------------------------------------- |
| `maxFileBytes`       | 67,108,864 | Bytes of one file (64 MiB)                                           |
| `maxRecordMessages`  | 691,200    | Records of one file: FIT record messages, or GPX and TCX trackpoints |
| `maxMessages`        | 1,000,000  | FIT only: data messages of every kind                                |
| `maxActivitySeconds` | 172,800    | The longest activity, in seconds (48 hours)                          |

## Archives

`DEFAULT_EXTRACT_LIMITS`, applied to each source (a zip, a gzip or a single file) and shared by the
zips nested in it.

| Field                       | Value         | What it bounds                                              |
| --------------------------- | ------------- | ----------------------------------------------------------- |
| `maxSourceBytes`            | 2,147,483,648 | Bytes of one source (2 GiB)                                 |
| `maxEntryBytes`             | 67,108,864    | Bytes of one entry, after gzip (64 MiB)                     |
| `maxTotalDecompressedBytes` | 2,147,483,648 | Bytes all activity entries of one source inflate to (2 GiB) |
| `maxFitFiles`               | 10,000        | FIT, GPX and TCX entries in one source                      |
| `maxArchiveEntries`         | 100,000       | Entry headers of any kind, nested zips included             |
| `maxBufferedBytes`          | 134,217,728   | Output held while entries stream (128 MiB)                  |

These two are not fields of the limits object; they are named constants in `import/limits.ts`.

| Constant                       | Value  | What it bounds                                                                        |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------- |
| `MAX_NESTED_ARCHIVE_DEPTH`     | 2      | Levels of zip inside zip that are read. A zip inside the deepest level is refused     |
| `DECOMPRESS_INPUT_CHUNK_BYTES` | 16,384 | Compressed bytes handed to a decompressor at a time, so what it gives back is bounded |

### Entries the import skips

A photo, a route, a note: an entry that is not an activity is never read. Each is still started and
drained, so the unzipper does not keep its compressed bytes, and what it costs depends on its method:

- **Stored** entries inflate nothing and are not counted.
- **Deflated** entries are inflated to find the next entry, so their output is counted and a hostile
  one is stopped (below).
- **Entries in any other method** (shrink, implode, deflate64, bzip2, LZMA, zstd, WinZip's AES wrapper
  at 99, or a number nobody has assigned; a method is a 16-bit number) are fed to a decoder that drops
  their input. They give no output and are not counted. An activity file in one of these methods is
  reported as unreadable and drained the same way.

The checks are on output size and on the compressed bytes read since the entry began, so they hold
for zips written with data descriptors, whose headers give no size. A stopped entry is not an error
of its own: the import never wanted it.

| Constant / field                                              | Value         | What it bounds                                                                                     |
| ------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| `MAX_SKIPPED_ENTRY_FREE_BYTES` / `maxSkippedEntryFreeBytes`   | 16,777,216    | Bytes one skipped entry may inflate to before its ratio is judged (16 MiB)                         |
| `MAX_SKIPPED_INFLATE_RATIO` / `maxSkippedInflateRatio`        | 100           | The most one skipped entry past its free bytes may inflate to, per compressed byte read            |
| `MAX_SKIPPED_GLOBAL_FREE_BYTES` / `maxSkippedGlobalFreeBytes` | 1,073,741,824 | Bytes all skipped entries of a source may inflate to before their ratio together is judged (1 GiB) |
| `MAX_SKIPPED_GLOBAL_RATIO` / `maxSkippedGlobalRatio`          | 20            | The most all skipped entries together may inflate to, per compressed byte read for them            |
| `MAX_SKIPPED_INFLATE_BYTES` / `maxSkippedInflateBytes`        | 8,589,934,592 | Bytes all skipped entries of a source may inflate to whatever their ratio (8 GiB), the backstop    |

When any of the three budgets for the whole source runs out, the entry that ran it out is reported
once, by name, and every skipped entry after it is started already stopped, so not even its first
piece is inflated. The files the import wants are read all the same: nothing a skipped entry holds is wanted,
so no activity is lost to it.

Worst case for the processor: the per-entry ratio stops one bomb after 16 MiB. Many small bombs add
up to the first gibibyte of output before the ratio of the whole is judged, and inflating zeros costs
about 3.6 seconds a gibibyte (measured: 512 MiB of zeros, 1.8 seconds), so a hostile archive costs
about 4 seconds there. Content that stays under the ratio of 20 to 1 can go on to the backstop, which
is on the order of 30 seconds at the same speed. A stored photo or a real note is near 1 to 1.

## Digests

One reader holds every digest to the same bounds: a digest being created, a stored row read by the
server or the signed-in app, and a digest in the device library. They are in
`packages/core/src/digest/readLimits.ts`, and `packages/contract/src/digestBounds.test.ts` holds each
to its edge. They are sized from what the importer can make, with room to spare; none is near a real
digest.

A bound on a number that names the activity (its start, duration, id, sport, version, power source or
model revision) makes the digest unreadable. A bound on any other number does not hide the activity
from a stored row or the device library: the reader takes the number as that field being unknown
(null for a heart rate, a mean power or a split value; NaN for a distance, climb, output, power term or
calibration sum), cuts a list past its cap, and drops a flag, climb section, distance best or piece of
evidence it cannot place. A digest being created is refused instead. A value of the wrong type is
damage and is never repaired. The rules are in `packages/core/src/digest/readRules.ts`.

A start outside the range a Date can show once made the signed-in app fail to load, on every load.
The bound on `startMs` closes that.

| Constant                     | Value                 | What it bounds                                                                                   |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| `EARLIEST_ACTIVITY_START_MS` | 0                     | The earliest start: 1 January 1970. The importer is stricter and refuses an activity before 2000 |
| `LATEST_ACTIVITY_START_MS`   | 4,102,444,800,000     | The latest start: 1 January 2100                                                                 |
| `MAX_ACTIVITY_S`             | 604,800               | The longest activity, in seconds (7 days). Also the most seconds of any second-valued field      |
| `MAX_ACTIVITY_DISTANCE_M`    | 25,000,000            | The farthest an activity may go (25,000 km)                                                      |
| `MAX_ACTIVITY_CLIMB_M`       | 1,000,000             | The most climbing an activity may report                                                         |
| `MAX_DIGEST_HEART_RATE`      | 300                   | The highest heart rate in any field, bpm. The importer drops samples above 250                   |
| `MAX_DIGEST_OUTPUT`          | 1,000,000             | The largest magnitude of an output, a power term or a mean power                                 |
| `MAX_DIGEST_SUM`             | 1,000,000,000,000,000 | The largest magnitude of a calibration sum                                                       |
| `MAX_DIGEST_TEXT_CHARS`      | 262,144               | The longest name, id, session key or message, in characters                                      |
| `MAX_DIGEST_REVISION`        | 1,000,000             | The newest model revision a digest may name                                                      |
| `MAX_DIGEST_FLAGS`           | 50                    | Quality flags a digest keeps                                                                     |
| `MAX_HR_BLOCKS`              | 2,014                 | Heart-rate blocks, from the longest activity                                                     |
| `MAX_CLIMB_SECTIONS`         | 5,040                 | Climb sections, from the longest activity                                                        |
| `STORED_BOUND_FACTOR`        | 4                     | How many times longer than a create a stored row's arrays may be                                 |
| `MAX_DRIFT_RATIO`            | 1,000,000             | The largest output per heart rate in a drift reading                                             |
| `MAX_SPLIT_DISTANCE_M`       | 100,000               | The longest split                                                                                |
| `MAX_DISTANCE_BESTS_READ`    | 32                    | Entries in a list of record-distance bests, before the reader drops those it does not know       |
| `MIN_DIGEST_TEMPERATURE_C`   | -30                   | The coldest a temperature summary may read, degrees Celsius                                      |
| `MAX_DIGEST_TEMPERATURE_C`   | 55                    | The warmest a temperature summary may read, degrees Celsius                                      |
| `MIN_TEMPERATURE_COVERAGE`   | 0.5                   | The least share of seconds a temperature summary may rest on                                     |

Not every bound is a plain maximum. A new digest is also held to the rules that tie one field to
another (a flag lies inside the activity, moving time is part of the duration, a heart-rate block
needs five minutes after the warm-up). A stored row from an older revision is read as it was
written, within the same numeric bounds.

## What is not bounded here

- The size of an uploaded original file (`MAX_FILE_BYTES`) and of a digest in a request
  (`MAX_DIGEST_BYTES`) are service limits, in [apps/api/LIMITS.md](../apps/api/LIMITS.md).
- A zip with many entries costs time in the unzipper in proportion to the square of the entry
  count; `maxArchiveEntries` bounds it at about ten seconds. Lowering it is open.
- Memory on a phone is not measured. The limits above bound the worst case of a single file; the
  peak of a whole import of a large export has been measured on a desktop only.
