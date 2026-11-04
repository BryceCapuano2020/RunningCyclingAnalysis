/*
 * The age grade at threshold as two pages print it, for the replica's truth check. The Balance page names the sport, then the
 * percent, then the level in sentence case ("RUNNING", "61%", "Local"); a sport page names the figure, then the level in capitals,
 * then the percent ("AGE GRADE AT THRESHOLD", "LOCAL", "61%"). Both read one grade, so the percent and the level must agree.
 */

const PERCENT = /^\d+%$/

const linesOf = (text) => text.split('\n').map((line) => line.trim())

/** What Balance prints under the meter for a sport named `title` ("RUNNING", "CYCLING"): `{ percent, level }`, or null. */
export function readBalanceGrade(text, title) {
  const lines = linesOf(text)
  const at = lines.findIndex((line, i) => line === title && PERCENT.test(lines[i + 1] ?? ''))
  if (at === -1 || (lines[at + 2] ?? '') === '') return null
  return { percent: lines[at + 1], level: lines[at + 2] }
}

/** What a sport page prints under "Age grade at threshold": `{ percent, level }`, or null where the page has no grade. */
export function readSportGrade(text) {
  const lines = linesOf(text)
  const at = lines.indexOf('AGE GRADE AT THRESHOLD')
  if (at === -1 || (lines[at + 1] ?? '') === '' || !PERCENT.test(lines[at + 2] ?? '')) return null
  return { percent: lines[at + 2], level: lines[at + 1] }
}

/** Whether two prints are one grade: the same percent, and the same level whatever its case. */
export const sameGrade = (a, b) =>
  a.percent === b.percent && a.level.toUpperCase() === b.level.toUpperCase()

/** A print as one phrase for a report: "61% Local". */
export const gradeText = ({ percent, level }) => `${percent} ${level}`
