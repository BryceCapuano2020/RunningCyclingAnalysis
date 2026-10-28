import { useState } from 'react'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { afterLabel } from '../lateInEffort'
import type { LateGroup } from '../lateInEffort'
import { effortLabel } from '../records'
import { ChartFrame } from './ChartFrame'
import { SportMark } from './SportMark'
import { durabilityDescription, durabilityTable, durabilityTitle } from './lateInEffortText'
import { labelSizePx, labelWidthPx, rootFontPx } from './rootFont'
import { linearScale } from './scale'
import { formatNative } from './sportAxis'
import './LateInEffort.css'

export interface DurabilityChartProps {
  sport: Sport
  /** One group for each duration that has a late best to show, shortest first. */
  groups: readonly LateGroup[]
  units: UnitSystem
  /** Muted text under the chart: how a level is supported, and what a lower figure does not say. */
  note: string
}

/** The mark's radius, and the space kept either side of the track so a mark on its end is not cut. */
const MARK_R = 5
/** Space between the label column, the track and the value column, in px. */
const COLUMN_GAP = 8
/** The fall the track always spans, as a share of the fresh best, so a small fall reads as small. */
const MIN_SPAN = 0.2
/** The narrowest the track may get before the labels give way, in px. */
const MIN_TRACK = 40
const GROUP_GAP = 10
const EDGE = 4

interface Row {
  key: string
  label: string
  value: number
  text: string
  /** Null for the fresh best. */
  afterS: number | null
}

/** A group's rows: the fresh best, then each late one, with their value as the sport writes it. */
function rowsOf(group: LateGroup, sport: Sport, units: UnitSystem): Row[] {
  const text = (value: number) => formatNative(sport, value, units)
  return [
    {
      key: `${group.durationS}-fresh`,
      label: 'Fresh',
      value: group.fresh.value,
      text: text(group.fresh.value),
      afterS: null,
    },
    ...group.cells.map((cell) => ({
      key: `${group.durationS}-${cell.afterS}`,
      label: `After ${afterLabel(cell.afterS)}`,
      value: cell.value,
      text: text(cell.value),
      afterS: cell.afterS,
    })),
  ]
}

/**
 * For each duration, the fresh best and the best starting after time on the move, as marks along a
 * track: the further left of the dashed fresh line, the further the output fell. The track spans at
 * least a fifth of the fresh best, so a small fall is a short stem. Position is the sport's own number
 * with better to the right, so a pace is placed by its speed and written as a pace.
 */
export function DurabilityChart({ sport, groups, units, note }: DurabilityChartProps) {
  const [rootPx] = useState(rootFontPx)
  const rowH = Math.max(26, Math.round(labelSizePx(rootPx) * 2))
  const headH = rowH
  const sets = groups.map((group) => ({ group, rows: rowsOf(group, sport, units) }))
  const rowCount = sets.reduce((sum, { rows }) => sum + rows.length, 0)
  const height = rowCount * rowH + sets.length * (headH + GROUP_GAP) + EDGE
  const labelCol = Math.max(
    ...sets.flatMap(({ rows }) => rows.map((row) => labelWidthPx(row.label, rootPx))),
  )
  const valueCol = Math.max(
    ...sets.flatMap(({ rows }) => rows.map((row) => labelWidthPx(row.text, rootPx))),
  )

  return (
    <ChartFrame
      title={durabilityTitle(sport, units)}
      description={durabilityDescription(sport, groups, units)}
      height={height}
      note={note}
      table={durabilityTable(sport, groups, units)}
    >
      {(size) => {
        const x0 = labelCol + COLUMN_GAP + MARK_R
        const x1 = Math.max(x0 + MIN_TRACK, size.width - valueCol - COLUMN_GAP - MARK_R)
        let top = EDGE
        return (
          <g data-sport={sport}>
            {sets.map(({ group, rows }) => {
              const fresh = group.fresh.value
              const lowest = Math.min(...rows.map((row) => row.value))
              const x = linearScale(
                [Math.min(fresh * (1 - MIN_SPAN), lowest * 0.98), fresh],
                [x0, x1],
              )
              const startY = top
              top += headH + rows.length * rowH + GROUP_GAP
              return (
                <g key={group.durationS} data-testid="late-group">
                  <text
                    className="late-chart__group"
                    x={0}
                    y={startY + headH / 2}
                    dominantBaseline="central"
                  >
                    {`Best ${effortLabel(group.durationS)}`}
                  </text>
                  <line
                    className="late-chart__fresh"
                    x1={x(fresh)}
                    x2={x(fresh)}
                    y1={startY + headH}
                    y2={startY + headH + rows.length * rowH}
                  />
                  {rows.map((row, i) => {
                    const y = startY + headH + i * rowH + rowH / 2
                    return (
                      <g key={row.key} data-testid="late-row">
                        <text className="late-chart__label" x={0} y={y} dominantBaseline="central">
                          {row.label}
                        </text>
                        <line className="late-chart__track" x1={x0} x2={x1} y1={y} y2={y} />
                        {row.afterS === null ? null : (
                          <line
                            className="late-chart__stem"
                            x1={x(fresh)}
                            x2={x(row.value)}
                            y1={y}
                            y2={y}
                          />
                        )}
                        <SportMark
                          sport={sport}
                          x={x(row.value)}
                          y={y}
                          r={MARK_R}
                          testId="late-mark"
                        />
                        <text
                          className="late-chart__value"
                          x={size.width}
                          y={y}
                          textAnchor="end"
                          dominantBaseline="central"
                        >
                          {row.text}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </g>
        )
      }}
    </ChartFrame>
  )
}
