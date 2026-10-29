import type { Sport } from '@rca/core/types'
import { wholeCentre } from '../../domain/lean'
import type { BalanceReading } from '../components/balanceScale'
import { readFrom, sideRange, signedCount, signedRange } from '../components/headlineText'
import { HEADLINE_LABEL } from '../grades'
import { SPORT_NOUN, SPORT_ORDER } from '../sports'
import { RangeTrack } from './RangeTrack'
import { StatTile } from './StatTile'

export interface LeanTileProps {
  /** The balance in points of age grade: the tile's figure and its range come from it, as the headline's do. */
  reading: BalanceReading
  /** Whether either sport's grade is an estimate, which the lean then is too. */
  estimated: boolean
}

/** The sports in the order they are subtracted: the first's grade less the second's. */
const [FIRST, SECOND] = SPORT_ORDER

/** What the figure measures, from the side the balance leans to: how far that sport's grade sits above the other's. */
function captionOf(leader: Sport | null): string {
  const at = `at your best ${HEADLINE_LABEL}`
  if (leader === null)
    return `How far apart your ${SPORT_NOUN[FIRST]} and ${SPORT_NOUN[SECOND]} grades sit, ${at}.`
  const other = leader === FIRST ? SECOND : FIRST
  return `How far your ${SPORT_NOUN[leader]} grade sits above ${SPORT_NOUN[other]}’s, ${at}.`
}

/**
 * The lean as a tile: the size of the gap in points, set large, with its 90% range as a shape. Its ends are
 * written from the side the balance leans to, signed when the range reaches zero, as the headline writes them.
 */
export function LeanTile({ reading, estimated }: LeanTileProps) {
  const size = Math.abs(wholeCentre(reading.lead))
  const side = readFrom(reading)
  const [low, high] = sideRange(reading)
  const centre = side === SECOND ? -reading.lead.centre : reading.lead.centre
  const signed = signedRange(reading)
  const edge = (value: number) => (signed ? signedCount(value) : String(Math.round(value)))
  return (
    <StatTile
      heading="Lean"
      basis={estimated ? 'estimated' : 'recorded'}
      figure={{
        number: size === 0 ? '0' : `+${size}`,
        unit: 'pts',
        side: size === 0 ? 'same grade' : `toward ${SPORT_NOUN[side]}`,
      }}
      track={
        <RangeTrack
          ends={[edge(low), edge(high)]}
          at={high > low ? (centre - low) / (high - low) : 0.5}
          label="90% range"
        />
      }
    >
      <p className="stat-tile__line">{captionOf(size === 0 ? null : side)}</p>
    </StatTile>
  )
}
