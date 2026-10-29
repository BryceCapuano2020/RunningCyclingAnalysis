import type { CSSProperties } from 'react'
import './RangeTrack.css'

export interface RangeTrackProps {
  /** The two ends of the range, as printed, in reading order: the first on the left. */
  ends: [first: string, second: string]
  /**
   * Where the estimate sits between the two ends, from 0 at the first to 1 at the second. A threshold
   * sits at the middle of its error range; a floor sits at the end it is the edge of.
   */
  at: number
  /** The word between the ends: "range", "90% range", "fit spread". */
  label: string
  /**
   * Drawn lighter and thinner than a 90% range: the fit's spread is a rough spread of the fit, not a
   * confidence interval, so its band is an outline and its track is slim.
   */
  spread?: boolean
}

/** The band takes this share of the track, centred, so the track reads as wider than the range it holds. */
const BAND_START = 22
const BAND_END = 78

/**
 * A range as a shape before it is digits: a track, a translucent band between two bracket ticks, and a
 * ring where the estimate sits. The ends are printed under it. The shape is drawn in the tile's own sport
 * colour (data-sport), or in ink where the figure is not a sport's, and is hidden from assistive technology:
 * the printed ends say the same.
 */
export function RangeTrack({ ends, at, label, spread = false }: RangeTrackProps) {
  const style = {
    '--band-start': `${BAND_START}%`,
    '--band-end': `${100 - BAND_END}%`,
    '--at': `${BAND_START + Math.min(Math.max(at, 0), 1) * (BAND_END - BAND_START)}%`,
  } as CSSProperties
  return (
    <div className={spread ? 'range-track range-track--spread' : 'range-track'} style={style}>
      <div className="range-track__bar" aria-hidden="true">
        <span className="range-track__band" />
        <span className="range-track__cap range-track__cap--first" />
        <span className="range-track__cap range-track__cap--second" />
        <span className="range-track__ring" />
      </div>
      <p className="range-track__ends">
        <span>{ends[0]}</span>
        <span className="range-track__label">{label}</span>
        <span>{ends[1]}</span>
      </p>
    </div>
  )
}
