/**
 * The bounds the digest reader holds every field to, in one place. They are sized from what the
 * importer can produce, with room to spare, so no digest the app makes is near one; they exist so a
 * crafted or damaged digest cannot carry a number the rest of the app has no way to show. See
 * docs/LIMITS.md for the reasons.
 */

/**
 * The earliest start a digest may carry: the Unix epoch. The importer is stricter, and refuses an
 * activity dated before 2000 (a device with an unset clock reads 1989); the reader only keeps a
 * start inside the range a Date can show.
 */
export const EARLIEST_ACTIVITY_START_MS = 0

/**
 * The latest start a digest may carry. The importer refuses a start more than a day after the moment
 * of the import; this is the fixed bound a reader can check without a clock, well inside the range a
 * Date can represent (a start outside that range makes the date formatters throw).
 */
export const LATEST_ACTIVITY_START_MS = Date.UTC(2100, 0, 1)

/** The longest activity, s: the importer's grid is seven days. The arrays below are sized from it. */
export const MAX_ACTIVITY_S = 7 * 24 * 60 * 60

/** The farthest an activity may go, m: seven days at the fastest speed the importer keeps, with margin. */
export const MAX_ACTIVITY_DISTANCE_M = 25_000_000

/** The most climbing an activity may report, m: every sample of the longest activity at the importer's climb rate. */
export const MAX_ACTIVITY_CLIMB_M = 1_000_000

/** The highest heart rate, bpm, a digest may carry. The importer drops samples above 250. */
export const MAX_DIGEST_HEART_RATE = 300

/** The largest magnitude of an output (W, m/s or W/kg), a power term or a mean power. Nothing near it is real. */
export const MAX_DIGEST_OUTPUT = 1_000_000

/** The largest magnitude of a calibration sum, which adds products of watts over every block of the ride. */
export const MAX_DIGEST_SUM = 1e15

/** The longest name, id, session key or message, in characters. Equal to the API's digest budget in bytes. */
export const MAX_DIGEST_TEXT_CHARS = 256 * 1024

/** The newest model revision a digest may name. Far above any real one; it only bounds the integer. */
export const MAX_DIGEST_REVISION = 1_000_000

/** Most quality flags a digest keeps. The producer slices to the same count. */
export const MAX_DIGEST_FLAGS = 50

/** HR blocks are 300 s long and start after a 600 s warm-up. */
export const MAX_HR_BLOCKS = Math.floor((MAX_ACTIVITY_S - 600) / 300)

/** Each climb section is at least 120 s and sections do not overlap. */
export const MAX_CLIMB_SECTIONS = Math.floor(MAX_ACTIVITY_S / 120)

/** A stored row may hold arrays this many times longer than a create may, and still be read. */
export const STORED_BOUND_FACTOR = 4

/** The largest ratio of one output per heart rate (first or second half of a steady effort). */
export const MAX_DRIFT_RATIO = 1_000_000

/** The longest split, m. A split is a kilometre or a mile, the last one partial; this leaves room for a longer unit. */
export const MAX_SPLIT_DISTANCE_M = 100_000

/**
 * Most entries a digest's list of record-distance bests may have before the reader looks at them.
 * A reader that drops distances it does not know can see more than it keeps, so the cap on what it
 * keeps (the number of record distances) is applied after.
 */
export const MAX_DISTANCE_BESTS_READ = 32

/** The coldest and warmest a temperature summary may read, degrees Celsius. */
export const MIN_DIGEST_TEMPERATURE_C = -30
export const MAX_DIGEST_TEMPERATURE_C = 55

/** The least share of an activity's seconds a temperature summary may rest on. Below it the digest has none. */
export const MIN_TEMPERATURE_COVERAGE = 0.5
