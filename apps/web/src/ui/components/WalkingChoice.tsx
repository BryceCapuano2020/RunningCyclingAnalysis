import { useEffect, useRef } from 'react'
import type { AthleteType } from '@rca/core/types'
import { countRunsLabel, labelledNote, WALKING_PACE_NOTE } from '../analysis/walkingPaceCopy'
import './WalkingChoice.css'

/** Counts runs at walking pace as runs. Whether the browser kept the choice is said by the controller's notKept. */
export type CountRuns = () => void

/** What an activity page needs to offer the choice for one run: whether it is counted, and how to change that. */
export interface WalkingChoice {
  counted: boolean
  onCount: CountRuns
  onStop: () => void
}

export interface CountWalkingRunsProps {
  /** How many runs the button counts, for its label. */
  count: number
  onCount: CountRuns
}

/**
 * The button that counts every run left out at walking pace, on a page that has nothing else to show for them.
 * The button goes when they are counted; the page moves focus to its heading once the state has flipped.
 */
export function CountWalkingRuns({ count, onCount }: CountWalkingRunsProps) {
  return (
    <div className="walking-choice">
      <button type="button" className="btn" onClick={onCount}>
        {countRunsLabel(count)}
      </button>
    </div>
  )
}

export interface WalkingPaceSectionProps {
  /** Whether the run is marked as at walking pace, and so left out. */
  walkingPace: boolean
  /** The athlete's label, when that is why the activity is left out: the line says so instead of the pace. */
  label?: AthleteType
  /** Absent where the choice is not offered. */
  choice?: WalkingChoice
}

/**
 * What an activity page says about a run at walking pace, and the choice: while it is left out, the line that
 * says so and "Count this run"; once it is counted, a line that says so and "Leave this run out". Each button
 * is replaced by the other, so focus follows the press to the one that took its place.
 */
export function WalkingPaceSection({ walkingPace, label, choice }: WalkingPaceSectionProps) {
  const countRef = useRef<HTMLButtonElement>(null)
  const stopRef = useRef<HTMLButtonElement>(null)
  // The button just pressed; focus moves to its replacement once that has rendered.
  const pressed = useRef<'count' | 'stop' | null>(null)
  const counted = choice?.counted === true
  useEffect(() => {
    if (pressed.current === 'count' && counted) stopRef.current?.focus()
    else if (pressed.current === 'stop' && walkingPace) countRef.current?.focus()
    else return
    pressed.current = null
  }, [counted, walkingPace])
  // A press that changed nothing must not move focus at some later flip, or on another page.
  useEffect(() => {
    const forget = () => {
      pressed.current = null
    }
    window.addEventListener('hashchange', forget)
    return () => {
      window.removeEventListener('hashchange', forget)
      forget()
    }
  }, [])

  if (walkingPace) {
    return (
      <div className="walking-choice">
        <p className="secondary">{label === undefined ? WALKING_PACE_NOTE : labelledNote(label)}</p>
        {choice !== undefined && (
          <button
            ref={countRef}
            type="button"
            className="btn"
            onClick={() => {
              pressed.current = 'count'
              choice.onCount()
            }}
          >
            {countRunsLabel(1)}
          </button>
        )}
      </div>
    )
  }
  if (choice === undefined || !counted) return null
  return (
    <div className="walking-choice">
      <p className="secondary">
        This run is at walking pace. You count it as a run, so it is in your run analysis.
      </p>
      <button
        ref={stopRef}
        type="button"
        className="btn"
        onClick={() => {
          pressed.current = 'stop'
          choice.onStop()
        }}
      >
        Leave this run out
      </button>
    </div>
  )
}
