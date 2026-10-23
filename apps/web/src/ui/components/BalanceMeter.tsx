import type { Interval } from '@rca/core/types'
import { balanceSentence, leanOf } from './headlineText'
import './BalanceMeter.css'

export interface BalanceMeterProps {
  /** Running over cycling, as a ratio of the two sports' energy at the same duration. */
  ratio: Interval
}

/** How far ahead a sport sits at the meter's edge: 30%; larger gaps are drawn at the edge. */
const SPAN = 0.3
const WIDTH = 320
const MID = WIDTH / 2
const TRACK_Y = 22

/** Ratio above 1 means running is ahead; the meter is symmetric in log terms around even. */
function offset(ratio: number): number {
  const gap = ratio >= 1 ? ratio - 1 : -(1 / ratio - 1)
  const clamped = Math.max(-SPAN, Math.min(SPAN, gap))
  return MID + (clamped / SPAN) * (MID - 8)
}

/**
 * The balance between the two sports as a meter: the band is the model's 90% range and the dot
 * its centre. Leaning toward cycling reads left, toward running right.
 */
export function BalanceMeter({ ratio }: BalanceMeterProps) {
  const lo = offset(ratio.p05)
  const hi = offset(ratio.p95)
  const centre = offset(ratio.p50)
  const leader = leanOf(ratio)
  return (
    <figure className="balance-meter">
      <svg
        className={`balance-meter__svg balance-meter--${leader}`}
        viewBox={`0 0 ${WIDTH} 56`}
        role="img"
        aria-label={balanceSentence(ratio)}
      >
        <rect
          className="balance-meter__track"
          x="0"
          y={TRACK_Y - 6}
          width={WIDTH}
          height="12"
          rx="6"
        />
        <rect
          className="balance-meter__band"
          x={lo}
          y={TRACK_Y - 8}
          width={Math.max(2, hi - lo)}
          height="16"
          rx="8"
        />
        <line
          className="balance-meter__even"
          x1={MID}
          x2={MID}
          y1={TRACK_Y - 14}
          y2={TRACK_Y + 14}
        />
        <circle className="balance-meter__dot" cx={centre} cy={TRACK_Y} r="8" />
        <text className="balance-meter__label balance-meter__label--ride" x="0" y="52">
          ← Leans cycling
        </text>
        <text className="balance-meter__label" x={MID} y="52" textAnchor="middle">
          Even
        </text>
        <text
          className="balance-meter__label balance-meter__label--run"
          x={WIDTH}
          y="52"
          textAnchor="end"
        >
          Leans running →
        </text>
      </svg>
    </figure>
  )
}
