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

/**
 * At or below this height a short phone tightens its spacing: a narrow phone's setup dialog sets its two
 * buttons on one row, so the sex options clear the sticky footer at 320 x 568 (SetupDialog.css). The page's
 * gaps, the figure stack, the drop zone, and the landing and Balance heroes tighten theirs, so Add files and
 * the meter's scale are on the first screen at 320 x 568 (components.css, Dropzone.css, App.css,
 * BalancePage.css, AppNotices.css). In landscape the pitch and the answer sit beside the drop zone and the meter.
 * Those rules match a finger (pointer: coarse) or a window at most PHONE_MAX_WIDTH_PX wide, so a short
 * desktop window keeps the tall layout. Each stylesheet writes 700 and 760 as literals, so change them together.
 */
export const SHORT_PHONE_MAX_HEIGHT_PX = 700

/**
 * From this width a short landscape screen sets the landing's pitch beside the drop zone. Below it (a 1280 px page
 * at 400% zoom is 320 px wide and 256 tall) two columns are narrower than the drop zone's buttons and the page
 * scrolls sideways, which WCAG 1.4.10 Reflow forbids. App.css writes 560 as a literal.
 */
export const LANDSCAPE_TWO_COLUMN_MIN_WIDTH_PX = 560

/** At or below this width the tab labels shrink, so four equal tabs keep "ACTIVITIES" in one line. */
export const SMALL_PHONE_MAX_WIDTH_PX = 360

/** From this width About you and Body and bike sit side by side on Profile, and stack below it. */
export const PROFILE_PAIR_MIN_WIDTH_PX = 900

/** At or below this width the period control fills the content width, so it meets the gutter on a phone. */
export const PERIOD_FULL_WIDTH_MAX_WIDTH_PX = 479

/**
 * At or below this width the period control shows short labels ("6 wk", "All"), so all of its segments fit one row
 * on a 320 px phone. The full names stay as the segments' accessible names.
 */
export const PERIOD_SHORT_LABEL_MAX_WIDTH_PX = 360

/**
 * At or below this width the equivalence list sets its values a step smaller, with narrower columns,
 * so each effort reads on one line on a 375 px phone. It is its own width, not the period grid's.
 */
export const EQUIVALENCE_SMALL_TEXT_MAX_WIDTH_PX = 379

/** At or below this width the Balance headline sets a step smaller, so no word is left alone at 320 px. */
export const HEADLINE_SMALL_MAX_WIDTH_PX = 359

/** From this width Sport and Sort share a row on Activities, the first width past the phone layout. */
export const SPLIT_FILTERS_MIN_WIDTH_PX = PHONE_MAX_WIDTH_PX + 1

/**
 * At or below this width the Balance answer is compact so the meter and the levels sit on the first screen: the eyebrow
 * goes (the period control under the levels states the dates) and the meter's value and the levels tighten
 * (BalancePage.css, BalanceMeter.css, BalanceLevels.css).
 */
export const BALANCE_PHONE_MAX_WIDTH_PX = 479

/** At or below this width a chart's end labels are values alone, which a key explains. */
export const NARROW_CHART_MAX_WIDTH_PX = 500
