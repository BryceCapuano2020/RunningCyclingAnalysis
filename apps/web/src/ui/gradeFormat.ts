import { gradePercent } from '@rca/core/grade'

/** A grade as the whole percent every surface shows, floored so it never reads above its level band. */
export function wholeGrade(grade: number): number {
  return Math.floor(gradePercent(grade) ?? 0)
}

/** A grade for display, such as "64%". */
export function formatGrade(grade: number): string {
  return `${wholeGrade(grade)}%`
}
