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
}

/** Where a lead sits on the track, as a CSS percentage from its left end. */
function percentAt(lead: number): number {
  return meterFraction(lead) * 100
}

/** The sport at each end of the track: the first in SPORT_ORDER is on the left. */
const [LEFT, RIGHT] = SPORT_ORDER

/** What the scale counts, and the band, for the caption under the meter. */
const KEY = {
  points: "Dot: best estimate. Band: the ride's 90% range",
  percent: 'Dot: best estimate. Band: 90% model range',
}

/**
 * The balance between the two sports: the band is the range and the dot the best estimate. The
 * sport on the left is the first in SPORT_ORDER, and a lead toward a sport moves the dot toward it.
 */
export function BalanceMeter({ reading }: BalanceMeterProps) {
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
    <figure className={`balance-meter balance-meter--${lean}`}>
      <div className="balance-meter__plot" role="img" aria-label={balanceSentence(reading)}>
        <span className="balance-meter__flag" style={{ left: `${percentAt(lead.centre)}%` }}>
          {flag}
        </span>
        <div className="balance-meter__track">
          <span
            className="balance-meter__band"
            style={{ left: `${(bandLeft + bandRight) / 2}%`, width: `${bandRight - bandLeft}%` }}
          />
          <span className="balance-meter__even" />
          <span className="balance-meter__dot" style={{ left: `${percentAt(lead.centre)}%` }} />
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
      <figcaption className="balance-meter__key">
        {unit === 'points'
          ? `${KEY.points}, ${rangeText(reading)}. Scale: age-grade points.`
          : `${KEY.percent}, ${rangeText(reading)}. Scale: percent of energy.`}
      </figcaption>
    </figure>
  )
}
