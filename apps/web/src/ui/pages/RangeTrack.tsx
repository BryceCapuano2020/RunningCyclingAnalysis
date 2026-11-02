import type { CSSProperties } from 'react'
import './RangeTrack.css'

export interface RangeTrackProps {
  /** The two ends of the range, as printed, in reading order: the first on the left. */
  ends: [first: string, second: string]
  /**
   * Where the estimate sits between the two ends, from 0 at the first to 1 at the second. A threshold
   * sits at the middle of its error range; a floor sits at the end it is the edge of. The ring sits
   * exactly there on the band, so a value equal to an end sits on that end's tick.
   */
  at: number
  /** The word between the ends: "range" or "90% range". */
  label: string
  /**
   * Drawn lighter and thinner than a 90% range: the fit's spread is a rough spread of the fit, not a
   * confidence interval, so its band is an outline and its track is slim.
   */
  spread?: boolean
}

/**
 * A range as a shape before it is digits: a track, a translucent band between two bracket ticks, and a
 * ring where the estimate sits. The band spans the printed ends exactly (the track runs a ring's radius
 * past each, so a ring on an end stays on the track), and each printed end starts at its tick. The shape is drawn in the tile's own sport
 * colour (data-sport), or in ink where the figure is not a sport's, and is hidden from assistive technology:
 * the printed ends are read as one phrase, "90% range 6 to 16", rather than as three loose figures.
 */
export function RangeTrack({ ends, at, label, spread = false }: RangeTrackProps) {
  const style = { '--at': Math.min(Math.max(at, 0), 1) } as CSSProperties
  return (
    <div className={spread ? 'range-track range-track--spread' : 'range-track'} style={style}>
      <div className="range-track__bar" aria-hidden="true">
        <span className="range-track__band" />
        <span className="range-track__cap range-track__cap--first" />
        <span className="range-track__cap range-track__cap--second" />
        <span className="range-track__ring" />
      </div>
      <p className="range-track__ends">
        <span aria-hidden="true">{ends[0]}</span>
        <span className="range-track__label" aria-hidden="true">
          {label}
        </span>
        <span aria-hidden="true">{ends[1]}</span>
        <span className="sr-only">{`${label} ${ends[0]} to ${ends[1]}`}</span>
      </p>
    </div>
  )
}
