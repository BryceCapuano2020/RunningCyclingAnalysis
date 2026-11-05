import { SPARK_FLOOR } from './sparkRule'
import type { SparkPoint } from './sparkRule'

export type { SparkPoint } from './sparkRule'
import './Sparkline.css'

const WIDTH = 96
const HEIGHT = 24
/** The room kept at the top and the foot, so the line's 1.5 px stroke is not clipped at its highest and lowest. */
const INSET = 2
/**
 * A row's trend as a tiny line in its sport's ink: the series the page already charts, by date, higher up. It carries
 * no figure of its own, so it is hidden from assistive technology; the chart it is drawn from has the table and the row
 * says its change in words. Fewer than two points draw nothing. Its range is never scaled tighter than SPARK_FLOOR of
 * the mean, centred, so a small wobble stays nearly flat.
 */
export function Sparkline({ points }: { points: readonly SparkPoint[] }) {
  if (points.length < 2) return null
  const times = points.map((point) => point.atMs)
  const values = points.map((point) => point.value)
  const [first, last] = [Math.min(...times), Math.max(...times)]
  const [min, max] = [Math.min(...values), Math.max(...values)]
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const span = Math.max(max - min, Math.abs(mean) * SPARK_FLOOR)
  const [low, high] = [(min + max) / 2 - span / 2, (min + max) / 2 + span / 2]
  const x = (atMs: number) =>
    last === first ? WIDTH / 2 : ((atMs - first) / (last - first)) * WIDTH
  const y = (value: number) =>
    high === low ? HEIGHT / 2 : INSET + (1 - (value - low) / (high - low)) * (HEIGHT - INSET * 2)
  const line = points.map((point) => `${x(point.atMs).toFixed(1)},${y(point.value).toFixed(1)}`)
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      aria-hidden="true"
      focusable="false"
    >
      <polyline points={line.join(' ')} />
    </svg>
  )
}
