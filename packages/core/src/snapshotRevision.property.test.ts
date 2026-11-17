import { describe, expect, it } from 'vitest'
import { MODEL_REVISION } from './digest/modelRevision'
import { currentRevision, revisionStatus } from './digest/revisions'
import { ANALYSIS_REVISION } from './analysisRevision'
import { LIFT_REVISION } from './lift'
import { STATE_SNAPSHOT_VERSION, snapshotIsCurrent } from './stateSnapshot'
import { check, fc } from './test/property'

/*
 * A stored result is current only when every revision it carries is this build's. One part off, in either direction or absent,
 * and it is not shown. A digest revision is current only at exactly the build's, and a higher one is newer, never compatible.
 */

const near = (current: number) =>
  fc.oneof(fc.constant(current), fc.integer({ min: Math.max(0, current - 3), max: current + 3 }))

describe('revision staleness', () => {
  it('a snapshot is current exactly when all four of its revisions match', () => {
    check(
      fc.property(
        near(STATE_SNAPSHOT_VERSION),
        near(MODEL_REVISION),
        fc.option(near(ANALYSIS_REVISION), { nil: undefined }),
        fc.option(near(LIFT_REVISION), { nil: undefined }),
        (schemaVersion, modelRevision, analysisRevision, liftRevision) => {
          const matches =
            schemaVersion === STATE_SNAPSHOT_VERSION &&
            modelRevision === MODEL_REVISION &&
            analysisRevision === ANALYSIS_REVISION &&
            liftRevision === LIFT_REVISION
          expect(
            snapshotIsCurrent({ schemaVersion, modelRevision, analysisRevision, liftRevision }),
          ).toBe(matches)
        },
      ),
      300,
    )
  })

  it('a digest revision is current only at the build revision, newer above it, and never both', () => {
    const now = currentRevision()
    check(
      fc.property(fc.integer({ min: -5, max: now + 20 }), (revision) => {
        const status = revisionStatus(revision)
        expect(status === 'current').toBe(revision === now)
        expect(status === 'newer').toBe(revision > now)
        if (revision < now) expect(['compatible', 'stale']).toContain(status)
      }),
      200,
    )
  })
})
