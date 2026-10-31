/*
 * How far a best is carried to a race, and how much a far one counts. A best is a lower bound on what the runner
 * can do, but the fastest of them is not a fair estimate: a training best further from the race's distance was
 * more often not all-out and carries an error that grows with the ratio, so the predictions take the near ones
 * and let the nearest lead.
 */

/**
 * A best predicts a race at most this many times its own distance (about three, so a mile still reaches a 5 km and
 * a 10 km a half marathon), since the error grows with the ratio: a forward test of the predictions found the bias
 * several times larger with an anchor more than three times the race's distance away than with a matched one.
 */
export const RIEGEL_MAX_RATIO = 3.2

/**
 * The marathon is carried from further back, to 10 km, because the mileage correction (Vickers & Vertosick) is
 * fitted to that reach. A 5 km, at over eight times, stays out.
 */
export const MARATHON_MAX_RATIO = 4.5

/**
 * How fast an anchor's weight falls with its distance from the race, as a standard deviation of the log of the
 * ratio: an anchor twice the race's distance counts for about 0.6 of one at the race's own. Taking the fastest
 * anchor instead reads every best as all-out, the optimistic end of what the bests allow.
 */
export const ANCHOR_PROXIMITY_LOG_SD = Math.LN2
