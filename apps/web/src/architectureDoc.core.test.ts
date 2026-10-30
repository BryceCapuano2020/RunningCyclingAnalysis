import { describe, expect, it } from 'vitest'
import {
  DISTANCE_BEST_TOLERANCE,
  HALF_MARATHON_M,
  HR_BLOCK_S,
  HR_SKIP_S,
  RUN_RECORD_DISTANCES_M,
} from '@rca/core/constants'
import {
  MAX_GARMIN_SUMMARIES_BYTES,
  MAX_GARMIN_SUMMARY_BYTES,
  MAX_GARMIN_SUMMARY_DEPTH,
  MAX_GARMIN_SUMMARY_OBJECTS,
  MAX_SUMMARY_FILES,
} from '@rca/core/import'
import { METRES_PER_MILE } from '@rca/core/units'
import { readStylesheet } from './ui/components/stylesheet'

/*
 * The facts docs/ARCHITECTURE.md states about the analysis core, pinned to the constants that set them.
 * The Strava list limits and the workbench cache are pinned in architectureDoc.test.ts; the API and
 * database facts in apps/api/src/architectureDoc.test.ts. Whitespace is collapsed, so a phrase the doc
 * wraps is still found.
 */
const doc = (await readStylesheet(import.meta.url, '../../../docs/ARCHITECTURE.md')).replace(
  /\s+/g,
  ' ',
)
const MIB = 1024 * 1024

/** Said when a pin fails: the page and the code disagree, and either may be the one that is wrong. */
const HINT =
  'docs/ARCHITECTURE.md and the code disagree: update the doc, or the code if the doc is right.'

describe('architecture doc: the Garmin export summaries', () => {
  it('gives the file, byte, object and depth caps as the reader sets them', () => {
    expect(doc, HINT).toContain(
      `at most ${MAX_SUMMARY_FILES} files, ${MAX_GARMIN_SUMMARY_BYTES / MIB} MiB inflated each (checked before parsing: at most ${MAX_GARMIN_SUMMARY_OBJECTS.toLocaleString('en-US')} objects and ${MAX_GARMIN_SUMMARY_DEPTH} levels of nesting) and ${MAX_GARMIN_SUMMARIES_BYTES / MIB} MiB together`,
    )
  })
})

describe('architecture doc: run distance bests', () => {
  it('lists the record distances in order, as the digest keeps them', () => {
    expect([...RUN_RECORD_DISTANCES_M]).toEqual([
      1000,
      METRES_PER_MILE,
      5000,
      10_000,
      HALF_MARATHON_M,
    ])
    expect(doc, HINT).toContain('(1 km, 1 mi, 5 km, 10 km and the half marathon)')
  })

  it('gives the tolerance for a run that falls a little short of a distance', () => {
    expect(doc, HINT).toContain(`\`DISTANCE_BEST_TOLERANCE\` (${DISTANCE_BEST_TOLERANCE * 100}%)`)
  })
})

describe('architecture doc: heart-rate blocks', () => {
  it('gives the block length and the warm-up the digest skips', () => {
    expect(doc, HINT).toContain(
      `all ${HR_BLOCK_S / 60}-minute blocks after the ${HR_SKIP_S / 60}-minute warm-up`,
    )
  })
})

describe('architecture doc: near-duplicate activities', () => {
  // The window itself is pinned in duplicates.test.ts; this holds the page to the same numbers.
  it('says start within 60 seconds and durations within 10% or 60 seconds', () => {
    expect(doc, HINT).toContain('start within 60 seconds of each other')
    expect(doc, HINT).toContain('durations within 10% or within 60 seconds of each other')
  })
})
