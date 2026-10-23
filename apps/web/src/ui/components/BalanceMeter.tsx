import type { Interval } from '@rca/core/types'
import { balanceSentence, leanOf } from './headlineText'
import { METER_TRACK, bandSpan, meterFraction } from './balanceScale'
import './BalanceMeter.css'

export interface BalanceMeterProps {
  /** Running over cycling, as a ratio of the two sports' energy at the same duration. */
  ratio: Interval
}

const WIDTH = METER_TRACK
const MID = WIDTH / 2
const TRACK_Y = 22
/** The band is this tall, and never narrower, so a single-value range stays a round band. */
const BAND_HEIGHT = 16

/** The x position of a ratio on the track. */
function offset(ratio: number): number {
  return meterFraction(ratio) * WIDTH
}

/**
 * The balance between the two sports as a meter: the band is the model's 90% range and the dot
 * its centre. Leaning toward cycling reads left, toward running right.
 */
export function BalanceMeter({ ratio }: BalanceMeterProps) {
  const lo = offset(ratio.p05)
  const hi = offset(ratio.p95)
  const centre = offset(ratio.p50)
  const band = bandSpan(lo, hi, BAND_HEIGHT)
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
          x={band.start}
          y={TRACK_Y - BAND_HEIGHT / 2}
          width={band.width}
          height={BAND_HEIGHT}
          rx={BAND_HEIGHT / 2}
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
