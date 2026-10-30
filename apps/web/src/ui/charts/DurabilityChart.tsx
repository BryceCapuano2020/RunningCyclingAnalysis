import { useState } from 'react'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { afterLabel } from '../lateInEffort'
import type { LateCell, LateGroup } from '../lateInEffort'
import { effortLabel } from '../records'
import { ChartFrame } from './ChartFrame'
import { SportMark } from './SportMark'
import {
  againstOverall,
  durabilityDescription,
  durabilityTable,
  durabilityTitle,
} from './lateInEffortText'
import { labelSizePx, labelWidthPx, rootFontPx } from './rootFont'
import { linearScale } from './scale'
import { formatNative } from './sportAxis'
import './LateInEffort.css'

export interface DurabilityChartProps {
  sport: Sport
  /** One group for each duration that has a late best to show, shortest first. */
  groups: readonly LateGroup[]
  units: UnitSystem
  /** The finding, set as the chart's title: "Held 99% of output after an hour". */
  takeaway: string
  /** Muted text under the chart: how a level is supported, and what a lower figure does not say. */
  note: string
}

const MARK_R = 6
/** A row whose value drops under its label is this many times as tall. */
const TALL_ROW = 1.4
/** Space between the label column, the track and the value column, in px. */
const COLUMN_GAP = 12
/** The narrowest the track may get before the labels give way, in px. */
const MIN_TRACK = 40
const EDGE = 4
/** The track runs this far below the lowest share, and above no fall at all, so a mark is never on its end. */
const PAD_BELOW = 0.05
const PAD_ABOVE = 0.02

interface Row {
  key: string
  label: string
  /** The late best as a share of the best overall, in the sport's own number: 1 is no fall. */
  retention: number
  /** "6:12 /mi, 99%": the late figure and how it stands against the best overall. */
  text: string
}

/** One row for each late best: what it is, the best overall it is read against, and the figure it came to. */
function rowsOf(groups: readonly LateGroup[], sport: Sport, units: UnitSystem): Row[] {
  return groups.flatMap((group) =>
    group.cells.map((cell: LateCell) => ({
      key: `${group.durationS}-${cell.afterS}`,
      label: `Best ${effortLabel(group.durationS)} after ${afterLabel(cell.afterS)}`,
      retention: cell.retention,
      text: `${formatNative(sport, cell.value, units)}, ${againstOverall(cell.retention).toLowerCase()}`,
    })),
  )
}

/**
 * Each late best against the best overall as a dumbbell: a ring at no fall, a solid mark at the share the late
 * best kept, and the bar between them, so how little (or how much) is lost is a length. Every row is on one scale,
 * of the share kept, so two rows read against each other, and the track runs only a few per cent past the
 * extremes, so a small fall is a short bar and not an empty row. The share is of the sport's own number, a pace's
 * by its speed, with better to the right.
 */
export function DurabilityChart({ sport, groups, units, takeaway, note }: DurabilityChartProps) {
  const [rootPx] = useState(rootFontPx)
  const baseRowH = Math.max(34, Math.round(labelSizePx(rootPx) * 2.4))
  const rows = rowsOf(groups, sport, units)
  const labelCol = Math.max(...rows.map((row) => labelWidthPx(row.label, rootPx)))
  const valueCol = Math.max(...rows.map((row) => labelWidthPx(row.text, rootPx)))
  // Too narrow for a label and a value on one line (large text, or a phone): the value drops under the label.
  const tallAt = (width: number) => width < labelCol + valueCol + COLUMN_GAP
  const rowHAt = (width: number) => (tallAt(width) ? Math.round(baseRowH * TALL_ROW) : baseRowH)

  return (
    <ChartFrame
      title={durabilityTitle(sport, units)}
      takeaway={takeaway}
      description={durabilityDescription(sport, groups, units)}
      height={(width) => rows.length * rowHAt(width) + 2 * EDGE}
      note={note}
      table={durabilityTable(sport, groups, units)}
    >
      {(size) => {
        // Narrow, the labels and values would leave the track no room: they stack over it, and the track is the row's lower half.
        const tall = tallAt(size.width)
        const rowH = rowHAt(size.width)
        const stacked =
          tall || size.width < labelCol + valueCol + MIN_TRACK + 2 * COLUMN_GAP + 2 * MARK_R
        const x0 = stacked ? MARK_R : labelCol + COLUMN_GAP + MARK_R
        const x1 = stacked
          ? size.width - MARK_R
          : Math.max(x0 + MIN_TRACK, size.width - valueCol - COLUMN_GAP - MARK_R)
        const x = linearScale(
          [Math.min(1, ...rows.map((row) => row.retention)) - PAD_BELOW, 1 + PAD_ABOVE],
          [x0, x1],
        )
        return (
          <g data-sport={sport}>
            {rows.map((row, i) => {
              const top = EDGE + i * rowH
              const y = tall ? top + rowH * 0.84 : stacked ? top + rowH * 0.7 : top + rowH / 2
              return (
                <g key={row.key} data-testid="late-row">
                  <text
                    className="late-chart__label"
                    x={0}
                    y={tall ? top + rowH * 0.2 : stacked ? top + rowH * 0.25 : y}
                    dominantBaseline="central"
                  >
                    {row.label}
                  </text>
                  <line className="late-chart__track" x1={x0} x2={x1} y1={y} y2={y} />
                  <line
                    className="late-chart__stem"
                    x1={x(1)}
                    x2={x(row.retention)}
                    y1={y}
                    y2={y}
                  />
                  <circle
                    data-testid="late-overall"
                    className="late-chart__overall-mark"
                    cx={x(1)}
                    cy={y}
                    r={MARK_R}
                  />
                  <SportMark
                    sport={sport}
                    x={x(row.retention)}
                    y={y}
                    r={MARK_R}
                    testId="late-mark"
                  />
                  <text
                    className="late-chart__value"
                    x={tall ? 0 : size.width}
                    y={tall ? top + rowH * 0.5 : stacked ? top + rowH * 0.25 : y}
                    textAnchor={tall ? 'start' : 'end'}
                    dominantBaseline="central"
                  >
                    {row.text}
                  </text>
                </g>
              )
            })}
          </g>
        )
      }}
    </ChartFrame>
  )
}
