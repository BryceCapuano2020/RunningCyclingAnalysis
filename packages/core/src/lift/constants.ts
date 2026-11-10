/**
 * Every constant of the e1RM estimator, one each, from docs/design/e1rm.md section 9. Change one only
 * through the spec, with a ledger row and a new LIFT_REVISION.
 */

/** Lombardi's exponent (research note). */
export const LOMBARDI_EXPONENT = 0.1

/** Reps to failure above this are not read: too far from a max. This prototype (section 7); the research note said 10. */
export const REP_CAP = 15

/** RPE below this is 4 or more in reserve, too far from failure to read a rep count. Zourdos 2016 scale. */
export const RPE_FLOOR = 6

/** Reps added per rep in reserve for lifters under-predicting it. Halperin 2022 direction; size a design value. */
export const UNDER_PREDICTION_PER_RIR = 0.25

/** Reps in reserve assumed with no RPE: the middle of 0 to 4. Research note. */
export const UNKNOWN_RIR = 2

/** SD of reps in reserve with no RPE: a uniform 0 to 4. */
export const UNKNOWN_RIR_SD = 1.15

/** Curve SD, in log units, per square root of (R - 1). Nuzzo 2024. */
export const CURVE_SD_SCALE = 0.023

/** Curve-centre SD, in log units, per (R - 1). This prototype (section 7). */
export const CENTRE_SD_PER_REP = 0.004

/** One day's strength varies by this much: 1RM test-retest CV, Grgic 2020. */
export const DAY_SD = 0.042

/** Systematic RPE spread, in reps, per rep in reserve. Halperin 2022 spread; size a design value. */
export const RPE_SYSTEMATIC_PER_RIR = 0.25

/** RPE noise SD, in reps: base plus per rep in reserve. Halperin 2022 shape; size a design value. */
export const RPE_NOISE_BASE = 0.5
export const RPE_NOISE_PER_RIR = 0.25

/** Sessions older than this before the estimate's date are not read. Research note. */
export const WINDOW_DAYS = 56

/** Weight of a session halves every this many days. Design value. */
export const HALF_LIFE_DAYS = 14

/** Near-the-top logistic for sessions with no RPE: share of the top, and width. threshold.md, step 2. */
export const NEAR_TOP_SHARE = 0.96
export const NEAR_TOP_WIDTH = 0.015

/** The top is taken from sessions this many days up to the newest. threshold.md. */
export const TOP_DAYS = 28

/** The range is 80%: z below and above the point, with more above. Design value. */
export const Z_LOW = 1.1
export const Z_HIGH = 1.5

/** The top of a deadlift-family lift widens by this share, for LeSuer's under-estimate; sized from the deadlift scenario. */
export const DEADLIFT_EXTRA_HIGH = 0.05

/** Rep bests run from 1 to this many reps. */
export const REP_BEST_MAX = 15

/** Allometric exponent for body mass: Jaric 2002. */
export const ALLOMETRIC_EXPONENT = 0.67

/** Mass error in log units: base, plus per 30 days since the entry, at most the cap. Design value (e1rm.md, section 4). */
export const MASS_SD_BASE = 0.01
export const MASS_SD_PER_30_DAYS = 0.005
export const MASS_SD_MAX = 0.04

/** A mass entry further than this from the estimate's date is not used. */
export const MASS_MAX_AGE_DAYS = 365

/** A working set at this RPE or higher is a hard set (3 or fewer in reserve). Design value. */
export const HARD_RPE = 7

/** An unmarked set lighter than this share of the session's top load, before the top set, is a warm-up. Design value. */
export const WARMUP_SHARE = 0.7

/** An own-data check event is a working set at this RPE or higher (e1rm.md, section 10). */
export const CHECK_RPE = 9.5

/** The check reads nothing under this many events: at 20 coverage has an SE near 9 points (e1rm.md, section 10). */
export const CHECK_MIN_EVENTS = 30

/** Coverage under this, with most misses above the range, says widen the centre term; over CHECK_NARROW_ABOVE, narrow it (e1rm.md, section 10). */
export const CHECK_WIDEN_BELOW = 0.7
export const CHECK_NARROW_ABOVE = 0.92
