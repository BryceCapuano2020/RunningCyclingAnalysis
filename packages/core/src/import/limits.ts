import { GIB, MIB } from '../constants'

/**
 * What a hostile or damaged file may ask of the importer, in one place. Each limit is far above
 * anything a real file holds and below what a browser tab survives, so a file past one is refused
 * rather than read on. docs/LIMITS.md says what each one is for and what refusing costs; a test
 * keeps that page in step with this one.
 */

// --- XML (GPX and TCX), enforced by the scanner in xml/parse.ts ---

/** Element nesting. The root element is depth 1. */
export const MAX_XML_DEPTH = 64

/** Elements, attributes and non-blank text runs when a document tree is built. */
export const MAX_XML_NODES = 3_000_000

/** The same count when the document is only scanned: nothing is kept, so only CPU bounds the work. */
export const MAX_XML_SCAN_NODES = 20_000_000

/** Attributes on one element. A trackpoint has two and the root of a GPX file about ten. */
export const MAX_XML_ATTRIBUTES_PER_ELEMENT = 64

/** Characters of an element or attribute name, namespace included. */
export const MAX_XML_NAME_CHARS = 256

/** Characters of one run of text or CDATA, before it is decoded. Real runs are indentation or a number. */
export const MAX_XML_TEXT_RUN_CHARS = 1 * MIB

/** Characters of one attribute value, before it is decoded. */
export const MAX_XML_ATTRIBUTE_CHARS = 64 * 1024

// --- GPX and TCX structure, enforced by the readers in gpx/parse.ts and tcx/parse.ts ---

/** Tracks (`trk`) in one GPX file. A route collection with more is split before it is imported. */
export const MAX_GPX_TRACKS = 1_000

/** Activities in one TCX file. */
export const MAX_TCX_ACTIVITIES = 1_000

/** Laps in one TCX file, over all its activities. */
export const MAX_TCX_LAPS = 10_000

/**
 * The most characters kept of a text field while reading a file. A value, a name or a time is far shorter;
 * a longer one is cut here, so a hostile field cannot grow with the file. It is also what `readNumber` reads
 * in full, so an overlong number text is refused whatever its cut.
 */
export const MAX_FIELD_CHARS = 1024

// --- CSV (the Strava activity list), enforced by import/csv.ts ---

/**
 * The most a Strava activity list may hold once inflated. A list of tens of thousands of activities
 * is a few megabytes, so this is generous. It bounds the text a list inflates to, but not the cells
 * a parser builds from that text: a row of commas is a cell per byte, and MAX_CSV_CELLS_PER_ROW
 * bounds those.
 */
export const MAX_ACTIVITY_LIST_BYTES = 32 * MIB

/**
 * The most cells one row of a Strava activity list may hold. A Strava export has about 80 to 90
 * columns, so 64 would refuse real exports; this leaves room for more. A row past the cap makes the
 * list malformed, so every file is read.
 */
export const MAX_CSV_CELLS_PER_ROW = 256

/** Characters of one CSV field. A real field is a name, a path or a note. */
export const MAX_CSV_FIELD_CHARS = 64 * 1024

// --- Zip archives, enforced by fit/zipReader.ts and fit/zipRun.ts ---

/** Compressed input is fed to the decompressors this many bytes at a time, so their output stays bounded. */
export const DECOMPRESS_INPUT_CHUNK_BYTES = 16 * 1024

/** A zip may hold zips this many levels down. A zip inside the deepest level is rejected. */
export const MAX_NESTED_ARCHIVE_DEPTH = 2

// --- Zip entries the import skips, enforced by fit/zipRun.ts ---
// An entry that is not an activity is never read, but a deflated one is inflated to find the next entry,
// so its output is counted and a hostile one is stopped. Entries that are stored, or use a method this
// build cannot inflate, cost nothing to skip and are not counted.

/** Bytes one skipped entry may inflate to before its ratio is judged. */
export const MAX_SKIPPED_ENTRY_FREE_BYTES = 16 * MIB

/** The inflated-to-compressed ratio past which a skipped entry that has passed its free bytes is stopped. */
export const MAX_SKIPPED_INFLATE_RATIO = 100

/** Bytes all skipped entries of one source may inflate to, nested zips included, before their ratio is judged. */
export const MAX_SKIPPED_GLOBAL_FREE_BYTES = 1 * GIB

/**
 * The inflated-to-compressed ratio of all the skipped entries of a source, past which the rest are no
 * longer inflated. A real export's skipped entries (photos, notes) are near 1 to 1, or a few to 1.
 */
export const MAX_SKIPPED_GLOBAL_RATIO = 20

/** Bytes all skipped entries of one source may inflate to, whatever their ratio. The backstop. */
export const MAX_SKIPPED_INFLATE_BYTES = 8 * GIB
