/*
 * The widths at which the header and its controls change shape, named once. Each stylesheet repeats
 * the number in its media query and names this file in a comment, so a change is made here and in
 * those queries together; Header.test.tsx fails when they disagree.
 */

/** At or below this width the tabs are a bar at the foot of the screen; the header is one row. */
export const PHONE_MAX_WIDTH_PX = 760

/**
 * At or below this width the header's wordmark is hidden, so the brand mark and the actions keep one
 * row. It is separate from COMPACT_PHONE_MAX_WIDTH_PX, which the sport card also reads.
 */
export const WORDMARK_HIDDEN_MAX_WIDTH_PX = 840

/** At or below this width a phone's account name is hidden to make room. */
export const COMPACT_PHONE_MAX_WIDTH_PX = 560

/** At or below this width Add files shows its plus only. */
export const NARROW_PHONE_MAX_WIDTH_PX = 420

/** At or below this width the tab labels shrink, so four equal tabs keep "ACTIVITIES" in one line. */
export const SMALL_PHONE_MAX_WIDTH_PX = 360

/** From this width About you and Body and bike sit side by side on Profile, and stack below it. */
export const PROFILE_PAIR_MIN_WIDTH_PX = 900
