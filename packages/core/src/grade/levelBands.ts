import { GRADE_LEVELS } from './ageGrade'

/**
 * One level's band in a sport's own figure (a time, watts, a lifted total): the best figure still inside the level and the worst
 * that earns it, both whole in the figure's step. A null end is open: no best for the top level, no worst for the lowest.
 */
export interface LevelBand {
  label: string
  best: number | null
  worst: number | null
}

/**
 * The bands of every level the athlete can reach, highest first. `entryAt` gives the figure that just earns a grade, rounded toward
 * earning it, or null when no figure does (above the sport's ceiling). A level's worst end is its own entry figure; its best end is
 * one step short of the entry of the level above, so two bands never share a figure. `higherIsBetter` is false for a time. Null
 * when no level above the lowest can be reached.
 */
export function levelBands(
  entryAt: (grade: number) => number | null,
  step: number,
  higherIsBetter: boolean,
): LevelBand[] | null {
  const reachable = GRADE_LEVELS.flatMap((level): { label: string; entry: number | null }[] => {
    if (level.min === 0) return [{ label: level.label, entry: null }]
    const entry = entryAt(level.min)
    return entry === null ? [] : [{ label: level.label, entry }]
  })
  if (reachable.length < 2) return null
  const toward = higherIsBetter ? -step : step
  return reachable.map(({ label, entry }, index) => {
    const above = reachable[index - 1]?.entry
    return { label, best: above == null ? null : above + toward, worst: entry }
  })
}
