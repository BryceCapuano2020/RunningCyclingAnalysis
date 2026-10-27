import type { CSSProperties } from 'react'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'
import { balanceSentence, rangeText } from './headlineText'
import {
  EVEN_LABEL,
  SCALE_SPAN,
  SCALE_TICKS,
  cappedEnds,
  capText,
  meterFraction,
  type BalanceReading,
} from './balanceScale'
import { SportIcon } from './icons'
import './BalanceMeter.css'

export interface BalanceMeterProps {
  /** The balance to draw: the age-grade gap in points, or the energy ratio in percent. */
  reading: BalanceReading
  /** True when the heart-rate check adjusted the range, which the key then says. */
  adjusted?: boolean
}

/** Where a lead sits on the track, as a CSS percentage from its left end. */
function percentAt(lead: number): number {
  return meterFraction(lead) * 100
}

/** The sport at each end of the track: the first in SPORT_ORDER is on the left. */
const [LEFT, RIGHT] = SPORT_ORDER

/** The key under the meter: what the dot and the band are, in the same words for both scales. */
const KEY = 'Dot: best estimate. Band: 90% range'
/** What the scale counts, in words, after the range in the key. The non-breaking hyphen keeps "age-grade" whole. */
const SCALE_KEY: Record<BalanceReading['unit'], string> = {
  points: 'Scale: age\u2011grade points.',
  percent: 'Scale: energy per kilogram.',
}
/** Said in the key when the heart-rate check adjusted the range. On a grade gap it takes the scale's place. */
const ADJUSTED_KEY = 'Adjusted by heart rate.'

/** What the key says after the range: the scale, with the heart-rate note added when it adjusted the range. */
function scaleKey(unit: BalanceReading['unit'], adjusted: boolean): string {
  if (!adjusted) return SCALE_KEY[unit]
  return unit === 'points' ? ADJUSTED_KEY : `${SCALE_KEY[unit]} ${ADJUSTED_KEY}`
}

/** A lead's place on the track, as the custom property the stylesheet clamps inside the plot. */
function placedAt(lead: number): CSSProperties {
  return { '--at': `${percentAt(lead)}%` } as CSSProperties
}

/**
 * The balance between the two sports: the band is the range and the dot the best estimate. The
 * sport on the left is the first in SPORT_ORDER, and a lead toward a sport moves the dot toward it.
 */
export function BalanceMeter({ reading, adjusted = false }: BalanceMeterProps) {
  const { lead, lean, unit } = reading
  const bandEdges = [percentAt(lead.low), percentAt(lead.high)]
  const bandLeft = Math.min(...bandEdges)
  const bandRight = Math.max(...bandEdges)
  const capped = cappedEnds(lead)
  const suffix = unit === 'percent' ? '%' : ''
  const flag = `${Math.round(Math.abs(lead.centre))}${unit === 'points' ? ' pts' : '%'}`
  const ticks = SCALE_TICKS.flatMap((value) =>
    [value, -value].map((position) => {
      const atEnd = value === SCALE_SPAN && (position > 0 ? capped.running : capped.cycling)
      return {
        key: position,
        left: percentAt(position),
        text: atEnd ? capText(unit) : `${value}${suffix}`,
        capped: atEnd,
      }
    }),
  )

  return (
    <figure className={`scale-figure balance-meter balance-meter--${lean}`}>
      <div className="balance-meter__plot" role="img" aria-label={balanceSentence(reading)}>
        <span className="balance-meter__flag" style={placedAt(lead.centre)}>
          {flag}
        </span>
        <div className="balance-meter__track">
          <span
            className="balance-meter__band"
            style={{ left: `${(bandLeft + bandRight) / 2}%`, width: `${bandRight - bandLeft}%` }}
          />
          <span className="balance-meter__even" />
          <span className="balance-meter__dot" style={placedAt(lead.centre)} />
        </div>
        <div className="balance-meter__ticks">
          {ticks.map((tick) => (
            <span
              key={tick.key}
              className={
                tick.capped ? 'balance-meter__tick balance-meter__tick--cap' : 'balance-meter__tick'
              }
              style={{ left: `${tick.left}%` }}
            >
              {tick.text}
            </span>
          ))}
        </div>
      </div>
      <div className="balance-meter__ends">
        <span className="balance-meter__end balance-meter__end--left" data-sport={LEFT}>
          <SportIcon sport={LEFT} className="balance-meter__glyph" />
          {SPORT_LABEL[LEFT]}
        </span>
        <span className="balance-meter__even-label">{EVEN_LABEL}</span>
        <span className="balance-meter__end balance-meter__end--right" data-sport={RIGHT}>
          <SportIcon sport={RIGHT} className="balance-meter__glyph" />
          {SPORT_LABEL[RIGHT]}
        </span>
      </div>
      <p className="balance-meter__key">{`${KEY}, ${rangeText(reading)}. ${scaleKey(unit, adjusted)}`}</p>
    </figure>
  )
}
