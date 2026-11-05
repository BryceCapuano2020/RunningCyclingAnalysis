import type { CSSProperties } from 'react'
import type { FitnessTrackModel } from '../fitnessModel'
import './FitnessTrack.css'

/** A position from -1 to 1 as the left edge's share of the track, in percent. */
const pct = (position: number) => `${50 + position * 50}%`

/**
 * The change as a shape before it is digits, drawn as the balance meter is: a hairline with "before" as a tick at its
 * middle and one ink mark where the estimate sits; the range is in the sentence beside it. Left is the sport's "less" side. A recovery also marks where the low was, so the way back reads left to right.
 * The shape is hidden from assistive technology; the card's sentence carries the same figures.
 */
export function FitnessTrack({ track }: { track: FitnessTrackModel }) {
  const style = {
    '--at': pct(track.at),
    '--floor': track.floor === null ? undefined : pct(track.floor),
  } as CSSProperties
  return (
    <div className="fitness-track" style={style}>
      <div className="fitness-track__bar" aria-hidden="true">
        <span className="fitness-track__zero" />
        {track.floor === null ? null : <span className="fitness-track__floor" />}
        <span className="fitness-track__ring" />
        <span className="meta fitness-track__tag fitness-track__tag--now">Now</span>
        {track.floor === null ? null : (
          <span className="meta fitness-track__tag fitness-track__tag--floor">Low</span>
        )}
      </div>
      <p className="meta fitness-track__ends">
        <span aria-hidden="true">{`← ${track.less}`}</span>
        <span className="fitness-track__before" aria-hidden="true">
          {track.before === '' ? 'Before' : `Before ${track.before}`}
        </span>
        <span aria-hidden="true">{`${track.more} →`}</span>
      </p>
    </div>
  )
}
