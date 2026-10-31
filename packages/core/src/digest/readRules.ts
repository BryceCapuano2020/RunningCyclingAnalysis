import { STORED_BOUND_FACTOR } from './readLimits'

/**
 * How one reader holds a digest. There is one set of rules for what a digest is; a reader differs
 * from another only in the ways below, each one a reason a row can be read that a new digest may
 * not be (or, for `bestsNeedDistance`, a rule the server keeps for the rollback floor's sake).
 *
 * Unknown keys are never a reason to refuse: every reader strips them. A newer build may add an
 * optional field, and an older reader (a Worker rolled back, a browser on yesterday's build) must
 * still list the activity; it does not carry the field it does not know forward. Nothing here keeps
 * an unknown key, because what is kept is stored and sent on, and must have been checked.
 */
export interface DigestRules {
  /**
   * Rows written by older revisions are read as they were: a missing or fractional duration, a curve
   * off the grid and flag, climb-section and curve-point numbers the digest-wide rules would refuse.
   * Arrays may be STORED_BOUND_FACTOR times longer. A new digest is held to every rule.
   */
  readonly lenient: boolean
  /**
   * The digest comes out of storage, and may have been written by a build newer than this reader, or
   * hold a number this build would not make. The reader then reads what it can and takes the rest as
   * unknown, so the activity is listed and not hidden:
   * - a quality kind or a record distance it does not know is dropped (a name of another build);
   * - a number outside its bounds is the field's own unknown value: null for a heart rate, a mean power
   *   or a split value, NaN for a distance, a climb, an output, a power term, a calibration sum or a
   *   curve window; a part that cannot be repaired (a flag, a climb section, a distance best, a point of
   *   evidence) is dropped, and a list longer than its cap is cut to it;
   * - a mark that is not true, a walking pace on a ride, bests on a ride and a moving time past the
   *   duration are read as absent or clamped.
   * What identifies the activity (id, name, sport, version, start, duration, power source) is never
   * repaired, and a value of the wrong type is damage and is never repaired. A digest being created is
   * refused instead: the server does not store what it cannot name or bound.
   */
  readonly tolerant: boolean
  /** How many times the create limit of each array a digest may hold. */
  readonly arrayFactor: number
  /**
   * Whether a run that has distance bests must also have a known distance. A run whose last distance
   * sample is missing makes a digest with no distance and bests; the server has refused it since the
   * bests were added, and does still, because an older Worker it may be rolled back to refuses to
   * read it back. The device and the signed-in app read it.
   */
  readonly bestsNeedDistance: boolean
  /**
   * Whether a flag of the cadence-lock kind (revision 7) is taken. A create took it only from release R2, which
   * moved the rollback floor to W1, the first Worker that can list a row with one; every view takes it now. The
   * option stays so the frozen readers of earlier releases (test/frozen) keep the rule they had.
   */
  readonly acceptsCadenceLock: boolean
}

/** A digest being created (POST /api/activities): every rule, nothing unknown. */
export const CREATE_RULES: DigestRules = {
  lenient: false,
  tolerant: false,
  arrayFactor: 1,
  bestsNeedDistance: true,
  acceptsCadenceLock: true,
}

/** A digest in a row the server stores, read by the server and by the signed-in app. */
export const STORED_RULES: DigestRules = {
  lenient: true,
  tolerant: true,
  arrayFactor: STORED_BOUND_FACTOR,
  bestsNeedDistance: false,
  acceptsCadenceLock: true,
}

/** A digest in the device library: written by this browser, so every rule, but possibly by a newer build. */
export const DEVICE_RULES: DigestRules = {
  lenient: false,
  tolerant: true,
  arrayFactor: 1,
  bestsNeedDistance: false,
  acceptsCadenceLock: true,
}

/** The reader that holds a digest to each set of rules. */
export type DigestView = 'create' | 'stored' | 'device'

export const RULES_OF_VIEW: Record<DigestView, DigestRules> = {
  create: CREATE_RULES,
  stored: STORED_RULES,
  device: DEVICE_RULES,
}
