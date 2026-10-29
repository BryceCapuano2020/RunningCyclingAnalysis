import { useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { ActivitySummary } from '@rca/core/pipeline'
import { COMPACT_PHONE_MAX_WIDTH_PX } from '../layoutBreakpoints'
import { formatSpan } from '../format/date'
import { useMatchMedia } from '../useMatchMedia'
import {
  bucketLabel,
  bucketSpan,
  countOf,
  countsText,
  emptyTotals,
  formatHoursText,
  inBucket,
  secondsOf,
  volumeBuckets,
  volumeColumns,
} from '../activitiesVolume'
import type { VolumeBucket, VolumeColumn } from '../activitiesVolume'
import { SPORT_LABEL, SPORT_ORDER } from '../sports'
import { plural } from './plural'
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

/** The index of the column a screen x falls in, or -1 between them. The group's children are its columns. */
function columnAt(group: Element, clientX: number): number {
  return [...group.children].findIndex((element) => {
    const box = element.getBoundingClientRect()
    return clientX >= box.left && clientX < box.right
  })
}

/** How far a tap may land from a column with training and still pick it, in px: about a fingertip's slop. */
const TAP_REACH_PX = 24

/**
 * The key of the column with training nearest a screen x, within TAP_REACH_PX of its edge; null beyond that, or
 * when the tap is on a skipped stretch's mark, which stands for nothing to pick.
 */
function nearestTrained(group: Element, columns: readonly VolumeColumn[], clientX: number) {
  if (columns[columnAt(group, clientX)]?.kind === 'gap') return null
  let best: { key: string; distance: number } | null = null
  columns.forEach((column, index) => {
    if (column.kind !== 'bucket' || countOf(column.bucket.totals) === 0) return
    const box = group.children[index]?.getBoundingClientRect()
    if (box === undefined) return
    const distance = Math.max(box.left - clientX, clientX - box.right, 0)
    if (distance > TAP_REACH_PX) return
    if (best === null || distance < best.distance) best = { key: column.bucket.key, distance }
  })
  return (best as { key: string } | null)?.key ?? null
}

/** A year or more with no training, folded to a narrow column with a break mark, as the trend's axis skips one. */
function SkippedStretch({ column }: { column: Extract<VolumeColumn, { kind: 'gap' }> }) {
  const span = formatSpan(column.fromMs, column.toMs - 1).replace(' – ', ' to ')
  return (
    <span
      className="volume-strip__gap"
      role="img"
      aria-label={`The strip skips ${span}, with no training`}
      title={`The strip skips ${span}`}
    >
      <svg viewBox="0 0 14 12" aria-hidden="true" focusable="false">
        <line x1="2" y1="11" x2="6" y2="1" />
        <line x1="8" y1="11" x2="12" y2="1" />
      </svg>
    </span>
  )
}

/**
 * Hours trained in each week, each month for a long stretch, or each quarter on a phone, stacked by sport, for the activities the
 * list is narrowed to. Its heading says what the stretch held. A column is a button: it narrows the list to
 * that week or month, and pressing it again lets go. The columns are one tab stop, moved by the arrow keys.
 */
export function VolumeStrip({ activities, periodText, selected, onSelect }: VolumeStripProps) {
  const phone = useMatchMedia(`(max-width: ${COMPACT_PHONE_MAX_WIDTH_PX}px)`)
  const buckets = useMemo(() => volumeBuckets(activities, phone), [activities, phone])
  const columns = useMemo(() => volumeColumns(buckets), [buckets])
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
  const groupRef = useRef<HTMLDivElement>(null)
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
  // The picked bucket may be of another grain than the strip draws (a quarter from a phone, on a desktop), so
  // its count is taken from the activities themselves.
  const pickedCount = pickedBucket
    ? countOf(pickedBucket.totals)
    : inBucket(activities, selected).length

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
    const buttons = groupRef.current?.querySelectorAll<HTMLButtonElement>('button[data-key]')
    ;[...(buttons ?? [])].find((button) => button.dataset.key === target.key)?.focus()
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
            <li key={sport} data-sport={sport} data-slot={SPORT_ORDER.indexOf(sport)}>
              {SPORT_LABEL[sport]}
            </li>
          ))}
        </ul>
      </div>
      <div
        className={`volume-strip__bars${pickedBucket ? ' volume-strip__bars--picked' : ''}`}
        role="group"
        ref={groupRef}
        onPointerUp={(event) => {
          // A tap that lands beside a thin column, not on a button, picks the nearest column that has training.
          if ((event.target as Element).closest('button') !== null) return
          const near = nearestTrained(event.currentTarget, columns, event.clientX)
          if (near !== null) onSelect(near === selected ? null : near)
        }}
        onPointerMove={(event) => {
          // A column may be a couple of pixels wide, so the readout follows the pointer across the strip.
          const over = columns[columnAt(event.currentTarget, event.clientX)]
          setPointed(
            over?.kind === 'bucket' && countOf(over.bucket.totals) > 0 ? over.bucket.key : null,
          )
        }}
        onPointerLeave={() => setPointed(null)}
        aria-label={`Hours trained each ${first.kind}, by sport. Press one to list only that ${first.kind}.`}
      >
        {columns.map((column) => {
          if (column.kind === 'gap') return <SkippedStretch key={column.fromMs} column={column} />
          const { bucket } = column
          if (countOf(bucket.totals) === 0) {
            return <span key={bucket.key} className="volume-strip__slot" aria-hidden="true" />
          }
          return (
            <button
              key={bucket.key}
              data-key={bucket.key}
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
              <span
                className="volume-strip__stack"
                style={{ height: `${(secondsOf(bucket.totals) / tallest) * 100}%` }}
              >
                {SPORT_ORDER.filter((sport) => bucket.totals[sport].seconds > 0).map((sport) => (
                  <span
                    key={sport}
                    className="volume-strip__part"
                    data-sport={sport}
                    data-slot={SPORT_ORDER.indexOf(sport)}
                    data-testid="volume-part"
                    style={{ flexGrow: bucket.totals[sport].seconds }}
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
            <span>{`Showing ${bucketLabel(pickedSpan)}${selected === null ? '' : `: ${plural(pickedCount, 'activity', 'activities')}`}`}</span>
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
