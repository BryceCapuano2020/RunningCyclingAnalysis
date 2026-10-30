/** Source and stylesheet files above this many lines are refactor candidates (docs/ENGINEERING.md). */
export const LINE_BUDGET = 400

/**
 * Files already over the budget, with the most lines each may have. A ratchet: lower an entry
 * whenever a change shrinks its file, and remove it once the file is within budget. Never raise
 * one; split the file instead. docs/ENGINEERING.md's hotspot section lists exactly these (a table when there are any).
 */
export const OVER_BUDGET = {}
