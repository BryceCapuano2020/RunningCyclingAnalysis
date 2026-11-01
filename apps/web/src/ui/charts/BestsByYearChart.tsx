import { useMemo, useState } from 'react'
import type { BestEffort } from '@rca/core/history'
import type { Sport } from '@rca/core/types'
import type { UnitSystem } from '@rca/core/units'
import { SPORT_FORMAT, SPORT_LABEL, SPORT_PLURAL } from '../sports'
import { bestsModel, bestsNote, markCell, markNote } from './bestsByYearModel'
import type { BestsModel } from './bestsByYearModel'
import { bestsChartHeight, bestsLayout } from './bestsByYearLayout'
import { ChartFrame } from './ChartFrame'
import type { ChartLegendEntry } from './ChartLegend'
import { ChartXAxis } from './ChartXAxis'
import { ChartYAxis } from './ChartYAxis'
import { Crosshair } from './Crosshair'
import { markerRadii, plotSurface, sizedOnce, tooltipAt, tooltipOverlay } from './chartInteraction'
import type { ChartSize, TooltipContent } from './chartTypes'
import { idleFrom } from './idleReadout'
import { linePath } from './paths'
import { PLOT_BOTTOM_WITHOUT_X_TITLE } from './plotBox'
import { SportMark } from './SportMark'
import { axisFontSize } from './ticks'
import './BestsByYearChart.css'

export interface BestsByYearChartProps {
  sport: Sport
  /** The sport's best at each length in each year (core's `bests`). */
  efforts: readonly BestEffort[]
  units: UnitSystem
}

/** The key for a point's two states: solid when heart rate shows the effort hard, an outline when it does not. */
const RING: Record<'dot' | 'diamond', 'ring' | 'ring-diamond'> = {
  dot: 'ring',
  diamond: 'ring-diamond',
}

function legendOf(model: BestsModel): ChartLegendEntry[] | undefined {
  if (!model.anyHollow) return undefined
  const { glyph } = SPORT_FORMAT[model.sport]
  if (!model.anySolid) return []
  return [
    { label: 'Hard effort', kind: model.sport, swatch: glyph },
    { label: model.hollowKey, kind: model.sport, swatch: RING[glyph] },
  ]
}

/** A year's tooltip: the best of each length that has one, with the clock time of a run and whether it was hard. */
function tooltipFor(model: BestsModel, i: number, x: number, y: number): TooltipContent | null {
  const year = model.years[i]
  if (year === undefined) return null
  const rows = model.panels.flatMap((panel) => {
    const mark = panel.marks[i]
    return mark === null || mark === undefined
      ? []
      : [
          {
            kind: model.sport,
            label: panel.label,
            value: mark.text,
            note: markNote(mark, panel.best === i),
          },
        ]
  })
  if (rows.length === 0)
    rows.push({ kind: model.sport, label: 'Best efforts', value: 'None', note: undefined })
  return { x, y, title: String(year), rows }
}

/**
 * A sport's best effort of each length in each year, as small charts on one run of years: a panel for each length with its
 * own axis (pace for a run, faster up; power for a ride), the all-time best large and labelled, and a best that heart rate
 * does not show was hard drawn hollow. The title is the measure.
 */
export function BestsByYearChart({ sport, efforts, units }: BestsByYearChartProps) {
  const model = useMemo(() => bestsModel(sport, efforts, units), [sport, efforts, units])
  const [active, setActive] = useState<number | null>(null)
  const layoutOf = sizedOnce((size: ChartSize) =>
    model === null ? null : bestsLayout(model, size),
  )
  const title = `${SPORT_LABEL[sport]} bests by year`
  const lede = bestsNote(sport, units)
  const empty = `Add outdoor ${SPORT_PLURAL[sport]} to see your bests by year`
  if (model === null) {
    return (
      <ChartFrame
        title={title}
        description={`Your ${SPORT_PLURAL[sport]}' bests by year.`}
        empty={empty}
        table={{ columns: [], rows: [] }}
      >
        {() => null}
      </ChartFrame>
    )
  }
  const latest = model.years.length - 1
  return (
    <ChartFrame
      title={title}
      lede={lede}
      description={`${lede}. A small chart for each of ${model.panels.map((panel) => panel.label).join(', ')}, with a mark for each year. The all-time best is labelled.`}
      height={bestsChartHeight(model.panels.length)}
      plotBottomMargin={PLOT_BOTTOM_WITHOUT_X_TITLE}
      legend={legendOf(model)}
      keyNote={model.anySolid ? undefined : `Hollow marks are ${model.hollowKey.toLowerCase()}`}
      idleReadout={idleFrom(tooltipFor(model, latest, 0, 0))}
      table={{
        caption: `${title}, ${lede.toLowerCase()}. At least marks a best not confirmed hard.`,
        columns: ['Year', ...model.panels.map((panel) => panel.label)],
        rows: model.years.map((year, i) => [
          String(year),
          ...model.panels.map((panel) => markCell(panel.marks[i] ?? null)),
        ]),
      }}
      surface={(size) => plotSurface(size, layoutOf(size)?.xs ?? null, active, setActive)}
      overlay={(size) =>
        tooltipOverlay(
          size,
          tooltipAt(size, layoutOf(size)?.xs ?? null, active, (i, x, y) =>
            tooltipFor(model, i, x, y),
          ),
        )
      }
    >
      {(size) => {
        const m = layoutOf(size)
        if (m === null) return null
        const fontSize = axisFontSize(size.width)
        const { marker, active: activeR } = markerRadii(size.width)
        return (
          <>
            <g className="bests-chart__x">
              <ChartXAxis ticks={m.xTicks} plot={size.plot} fontSize={fontSize} />
            </g>
            {model.panels.map((panel, p) => {
              const layout = m.panels[p]!
              return (
                <g key={panel.length} data-testid="bests-panel" data-length={panel.length}>
                  <ChartYAxis
                    ticks={layout.yTicks}
                    plot={layout.box}
                    title={panel.label}
                    fontSize={fontSize}
                  />
                  {active === null ? null : <Crosshair x={m.xs[active]!} plot={layout.box} />}
                  <path
                    className="chart-series__line bests-line"
                    data-sport={sport}
                    d={linePath(layout.points)}
                  />
                  {layout.points.map((point, i) => {
                    const mark = panel.marks[i]
                    if (point === null || mark === null || mark === undefined) return null
                    const top = i === panel.best
                    return (
                      <SportMark
                        key={mark.year}
                        sport={sport}
                        x={point.x}
                        y={point.y}
                        r={top || i === active ? activeR : marker}
                        hollow={mark.hollow}
                        testId={top ? 'best-mark-top' : 'best-mark'}
                      />
                    )
                  })}
                  {layout.label === null ? null : (
                    <text
                      data-testid="best-label"
                      className="chart-series__label"
                      textAnchor={layout.label.anchor}
                      x={layout.label.x}
                      y={layout.label.y}
                    >
                      {layout.label.text}
                    </text>
                  )}
                </g>
              )
            })}
          </>
        )
      }}
    </ChartFrame>
  )
}
