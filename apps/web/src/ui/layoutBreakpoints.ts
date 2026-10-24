/*
 * The widths at which the header and its controls change shape, named once. Each stylesheet repeats
 * the number in its media query and names this file in a comment, so a change is made here and in
 * those queries together; Header.test.tsx fails when they disagree.
 */

/** At or below this width the tabs are a bar at the foot of the screen; the header is one row. */
export const PHONE_MAX_WIDTH_PX = 760

/** At or below this width a phone's wordmark and its account name are hidden to make room. */
export const COMPACT_PHONE_MAX_WIDTH_PX = 560

/** At or below this width Add files shows its plus only. */
export const NARROW_PHONE_MAX_WIDTH_PX = 420

/** At or below this width the tab labels shrink, so four equal tabs keep "ACTIVITIES" in one line. */
export const SMALL_PHONE_MAX_WIDTH_PX = 360
