import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import {
  bucketLabel,
  bucketSpan,
  countOf,
  countsText,
  emptyTotals,
  formatHoursText,
  secondsOf,
  volumeBuckets,
} from '../activitiesVolume'
import type { VolumeBucket } from '../activitiesVolume'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'
import './VolumeStrip.css'

export interface VolumeStripProps {
  /** The activities the list is narrowed to by period and sport, before any week or month is picked. */
  activities: readonly ActivitySummary[]
  /** Where the period ends the takeaway: "in the last 6 weeks", or "across all time". */
  periodText: string
  /** The key of the week or month the list is narrowed to, or null for the whole period. */
  selected: string | null
  /** Narrows the list to a bucket by its key, or back to the whole period with null. */
  onSelect: (key: string | null) => void
}

const capitalised = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`

/** One bucket in words: "Week of 3 Jun 2025: 3 runs and 1 ride, 4.2 h". */
function describe(bucket: VolumeBucket): string {
  return `${capitalised(bucketLabel(bucket))}: ${countsText(bucket.totals)}, ${formatHoursText(secondsOf(bucket.totals))}`
}

/** The first and last bucket's dates, which the axis names; the strip is read left (oldest) to right. */
function edgeLabel(bucket: VolumeBucket): string {
  return capitalised(bucketLabel(bucket).replace(/^week of /, ''))
}

/**
 * Hours trained in each week, or each month for a long stretch, stacked by sport, for the activities the
 * list is narrowed to. Its heading says what the stretch held. A column is a button: it narrows the list to
 * that week or month, and pressing it again lets go. The columns are one tab stop, moved by the arrow keys.
 */
export function VolumeStrip({ activities, periodText, selected, onSelect }: VolumeStripProps) {
  const buckets = useMemo(() => volumeBuckets(activities), [activities])
  const totals = useMemo(() => {
    const all = emptyTotals()
    for (const bucket of buckets) {
      for (const sport of SPORT_ORDER) {
        all[sport].count += bucket.totals[sport].count
        all[sport].seconds += bucket.totals[sport].seconds
      }
    }
    return all
  }, [buckets])
  const [pointed, setPointed] = useState<string | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const first = buckets[0]
  const last = buckets.at(-1)
  if (first === undefined || last === undefined) return null

  const trained = buckets.filter((bucket) => countOf(bucket.totals) > 0)
  const tallest = Math.max(...buckets.map((bucket) => secondsOf(bucket.totals)))
  const busiest = trained.reduce((best, bucket) =>
    secondsOf(bucket.totals) > secondsOf(best.totals) ? bucket : best,
  )
  // One tab stop: the picked column, or the newest one that holds training.
  const stop = trained.find((bucket) => bucket.key === selected) ?? trained.at(-1)
  const pickedSpan = selected === null ? null : bucketSpan(selected)
  const pickedBucket = buckets.find((bucket) => bucket.key === selected)

  const move = (event: KeyboardEvent, from: VolumeBucket) => {
    const at = trained.indexOf(from)
    const target =
      event.key === 'ArrowLeft'
        ? trained[at - 1]
        : event.key === 'ArrowRight'
          ? trained[at + 1]
          : event.key === 'Home'
            ? trained[0]
            : event.key === 'End'
              ? trained.at(-1)
              : undefined
    if (target === undefined) return
    event.preventDefault()
    buttons.current.get(target.key)?.focus()
  }

  const shown = buckets.find((bucket) => bucket.key === (pointed ?? selected)) ?? null
  const readout =
    shown !== null
      ? describe(shown)
      : `Busiest: ${bucketLabel(busiest)}, ${formatHoursText(secondsOf(busiest.totals))}`

  return (
    <section className="volume-strip" aria-labelledby="volume-strip-takeaway">
      <div className="volume-strip__head">
        <h2 id="volume-strip-takeaway" className="volume-strip__takeaway">
          <strong>{countsText(totals)}</strong>
          {`, ${formatHoursText(secondsOf(totals))}, ${periodText}`}
        </h2>
        <ul className="volume-strip__key" aria-label="Sports">
          {SPORT_ORDER.filter((sport) => totals[sport].count > 0).map((sport) => (
            <li key={sport} data-sport={sport}>
              {SPORT_LABEL[sport]}
            </li>
          ))}
        </ul>
      </div>
      <div
        className={`volume-strip__bars${pickedBucket ? ' volume-strip__bars--picked' : ''}`}
        role="group"
        onPointerMove={(event) => {
          // A column may be a couple of pixels wide, so the readout follows the pointer across the strip.
          const box = event.currentTarget.getBoundingClientRect()
          const at = Math.floor(((event.clientX - box.left) / box.width) * buckets.length)
          const over = buckets[Math.min(buckets.length - 1, Math.max(0, at))]
          setPointed(over !== undefined && countOf(over.totals) > 0 ? over.key : null)
        }}
        onPointerLeave={() => setPointed(null)}
        aria-label={`Hours trained each ${first.kind}, by sport. Press one to list only that ${first.kind}.`}
      >
        {buckets.map((bucket) => {
          const seconds = secondsOf(bucket.totals)
          if (seconds === 0 && countOf(bucket.totals) === 0) {
            return <span key={bucket.key} className="volume-strip__slot" aria-hidden="true" />
          }
          return (
            <button
              key={bucket.key}
              ref={(element) => {
                if (element === null) buttons.current.delete(bucket.key)
                else buttons.current.set(bucket.key, element)
              }}
              type="button"
              className="volume-strip__bar"
              aria-pressed={bucket.key === selected}
              aria-label={describe(bucket)}
              tabIndex={bucket.key === stop?.key ? 0 : -1}
              onClick={() => onSelect(bucket.key === selected ? null : bucket.key)}
              onKeyDown={(event) => move(event, bucket)}
              onFocus={() => setPointed(bucket.key)}
              onBlur={() => setPointed(null)}
            >
              <span className="volume-strip__stack">
                {SPORT_ORDER.filter((sport) => bucket.totals[sport].seconds > 0).map((sport) => (
                  <span
                    key={sport}
                    className="volume-strip__part"
                    data-sport={sport}
                    data-testid="volume-part"
                    style={{ height: `${(bucket.totals[sport].seconds / tallest) * 100}%` }}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
      <div className="volume-strip__axis">
        <span aria-hidden="true">{edgeLabel(first)}</span>
        {pickedSpan !== null && (pointed === null || pointed === selected) ? (
          <p className="volume-strip__chip">
            <span>{`Showing ${bucketLabel(pickedSpan)}`}</span>
            <button type="button" className="volume-strip__clear" onClick={() => onSelect(null)}>
              Clear
            </button>
          </p>
        ) : (
          <span className="volume-strip__readout" aria-hidden="true">
            {readout}
          </span>
        )}
        <span className="volume-strip__edge-end" aria-hidden="true">
          {edgeLabel(last)}
        </span>
      </div>
    </section>
  )
}
