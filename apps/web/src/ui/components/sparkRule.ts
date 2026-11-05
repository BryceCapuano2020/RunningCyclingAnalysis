/** A dated value a sparkline draws: when, and the figure in the sport's own unit, higher being better. */
export interface SparkPoint {
  atMs: number
  value: number
}

/** The fewest points a sparkline is drawn from: fewer is a steep stroke that says less than the row's words. */
export const MIN_SPARK_POINTS = 6
/**
 * The narrowest range a line is scaled to, as a share of the series' mean: a wobble smaller than this draws nearly flat
 * rather than filling the height, so the line never shows a change the figures do not have.
 */
export const SPARK_FLOOR = 0.03

/**
 * Whether a list draws its sparklines: only when every row has one of at least MIN_SPARK_POINTS points, so the lines
 * read as a column and no row stands out for having one.
 */
export function sparksDrawn(series: readonly (readonly SparkPoint[] | undefined)[]): boolean {
  return series.length > 0 && series.every((points) => (points?.length ?? 0) >= MIN_SPARK_POINTS)
}

/** Which way a series went, first to last, in a word; a move inside SPARK_FLOOR of the mean is flat. */
export function sparkTrend(points: readonly SparkPoint[]): 'up' | 'down' | 'flat' {
  const byDate = [...points].sort((a, b) => a.atMs - b.atMs)
  const [first, last] = [byDate[0]?.value ?? 0, byDate.at(-1)?.value ?? 0]
  const mean = points.reduce((sum, point) => sum + point.value, 0) / Math.max(points.length, 1)
  if (Math.abs(last - first) < Math.abs(mean) * SPARK_FLOOR) return 'flat'
  return last > first ? 'up' : 'down'
}
