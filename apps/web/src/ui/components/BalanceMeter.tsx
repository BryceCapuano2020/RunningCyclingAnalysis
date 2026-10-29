import type { CSSProperties } from 'react'
import { SPORT_ORDER, SPORT_TITLE } from '../sports'
import { balanceSentence } from './headlineText'
import { EVEN_LABEL, capText, cappedEnds, meterFraction, type BalanceReading } from './balanceScale'
import { DEFINITIONS } from '../pages/balanceDefinitions'
import { Definition } from './Definition'
import { SportIcon } from './icons'
import { RANGE_WORD, meterRange, meterValue, rangeVerdictText, readingChars } from './meterReading'
import './BalanceMeter.css'

export interface BalanceMeterProps {
  /** The balance to draw: the age-grade gap in points, or the energy ratio in percent. */
  reading: BalanceReading
  /** True when the heart-rate check informed the range of an energy balance, which the line under the range says. */
  adjusted?: boolean
}

/** Where a lead sits on the track, as a CSS percentage from its left end. */
function percentAt(lead: number): number {
  return meterFraction(lead) * 100
}

/** The sport at each end of the track: the first in SPORT_ORDER is on the left. */
const [LEFT, RIGHT] = SPORT_ORDER

/** A lead's place on the track, as the custom property the stylesheet clamps inside the plot. */
function placedAt(lead: number): CSSProperties {
  return { '--at': `${percentAt(lead)}%` } as CSSProperties
}

/** The balance's name for a screen reader: the sentence, and for a grade lead what its range says. */
function nameOf(reading: BalanceReading): string {
  const verdict = rangeVerdictText(reading)
  return verdict === null ? balanceSentence(reading) : `${balanceSentence(reading)}, ${verdict}`
}

/** The reading's place and its size in characters, which the stylesheet keeps clear of the track's ends. */
function readingStyle(reading: BalanceReading): CSSProperties {
  const chars = readingChars(reading)
  return {
    ...placedAt(reading.lead.centre),
    '--number-chars': chars.number,
    '--unit-chars': chars.unit,
    '--range-chars': chars.range,
  } as CSSProperties
}

/**
 * The balance between the two sports as one line: the dot is the best estimate and the band behind it the
 * range. The value and the range are written right under the dot, so the line needs no key. The sport on
 * the left is the first in SPORT_ORDER, and a lead toward a sport moves the dot toward it.
 */
export function BalanceMeter({ reading, adjusted = false }: BalanceMeterProps) {
  const { lead, lean } = reading
  const bandEdges = [percentAt(lead.low), percentAt(lead.high)]
  const bandLeft = Math.min(...bandEdges)
  const bandRight = Math.max(...bandEdges)
  const value = meterValue(reading)
  const range = meterRange(reading)
  const capped = cappedEnds(lead)
  const cappedSport = { run: capped.running, ride: capped.cycling }
  const cap = capText(reading.unit)

  return (
    <figure className={`scale-figure balance-meter balance-meter--${lean}`}>
      <div className="balance-meter__ends">
        <span className="balance-meter__end balance-meter__end--left" data-sport={LEFT}>
          <SportIcon sport={LEFT} className="balance-meter__glyph" />
          {SPORT_TITLE[LEFT]}
          {cappedSport[LEFT] ? <span className="balance-meter__cap">{cap}</span> : null}
        </span>
        <span className="balance-meter__even-label">{EVEN_LABEL}</span>
        <span className="balance-meter__end balance-meter__end--right" data-sport={RIGHT}>
          {cappedSport[RIGHT] ? <span className="balance-meter__cap">{cap}</span> : null}
          <SportIcon sport={RIGHT} className="balance-meter__glyph" />
          {SPORT_TITLE[RIGHT]}
        </span>
      </div>
      <div className="balance-meter__plot">
        <div className="balance-meter__track" role="img" aria-label={nameOf(reading)}>
          <span
            className="balance-meter__band"
            style={{ left: `${(bandLeft + bandRight) / 2}%`, width: `${bandRight - bandLeft}%` }}
          />
          <span className="balance-meter__even" />
          <span className="balance-meter__dot" style={placedAt(lead.centre)} />
        </div>
        <div className="balance-meter__reading" style={readingStyle(reading)}>
          <p className="balance-meter__value">
            <span className="balance-meter__number">{value.number}</span>
            <span className="balance-meter__unit">{value.unit}</span>
          </p>
          {range === null ? null : (
            <p className="balance-meter__range">
              <Definition meaning={DEFINITIONS.range90}>{RANGE_WORD}</Definition>{' '}
              <span className="balance-meter__edges">{range}</span>
            </p>
          )}
          {adjusted && reading.unit === 'percent' ? (
            <p className="balance-meter__basis">informed by heart rate</p>
          ) : null}
        </div>
      </div>
    </figure>
  )
}
