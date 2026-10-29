import { useLayoutEffect, useState } from 'react'
import type { Sport } from '@rca/core/types'
import { ChartTable } from '../charts/ChartTable'
import { rootFontPx } from '../charts/rootFont'
import { Definition } from '../components/Definition'
import { SportIcon } from '../components/icons'
import { HEADLINE_LABEL } from '../grades'
import { SPORT_LABEL } from '../sports'
import { DEFINITIONS } from './balanceDefinitions'
import { SAME_GRADE, SCALE_TABLE_COLUMNS, VIA_EQUIVALENT } from './balanceScaleModel'
import { levelEdgesText } from './balanceScaleAxis'
import { BALANCE_PHONE_MAX_WIDTH_PX } from '../layoutBreakpoints'
import { useNarrowScreen } from '../useNarrowScreen'
import type { ScaleModel } from './balanceScaleModel'
import { scaleLayout } from './balanceScaleLayout'
import type { LaneBox, ScaleLayout, TextAt } from './balanceScaleLayout'
import './BalanceScale.css'
import './BalanceScaleKey.css'

export interface BalanceScaleProps {
  model: ScaleModel
}

/** The width the drawing assumes before it has been measured: the window's, up to a desktop plot's, so a phone starts compact. */
const DESKTOP_START = 640
const GUTTER = 32

function firstWidth(): number {
  if (typeof window === 'undefined') return DESKTOP_START
  return Math.max(Math.min(window.innerWidth - GUTTER, DESKTOP_START), 1)
}

/**
 * The stage's width, measured before the first paint so a phone never flashes the desktop drawing, and again as
 * it resizes. Until a measurement is made the width is the window's, not a desktop's.
 */
function useStageWidth(): [(node: HTMLElement | null) => void, number] {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [width, setWidth] = useState(firstWidth)
  useLayoutEffect(() => {
    if (node === null) return
    const measure = (measured: number) => {
      if (measured > 0) setWidth(Math.floor(measured))
    }
    measure(node.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => measure(entries[0]?.contentRect.width ?? 0))
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return [setNode, width]
}

/** A text's anchor point as the SVG attributes that place it. */
function at(text: TextAt) {
  return { x: text.x, y: text.y, textAnchor: text.anchor }
}

/** The neutral level bands, each named at its top when the name fits, and the ticks under them. */
function Bands({ layout }: { layout: ScaleLayout }) {
  const { plot, metrics: m, bands, ticks } = layout
  return (
    <>
      {bands.map((band) => (
        <g key={band.name}>
          <rect
            className="balance-scale__band"
            data-level={band.level}
            x={band.x}
            y={plot.top}
            width={Math.max(band.w - 1, 0)}
            height={plot.bottom - plot.top}
          />
          {band.label === null ? null : (
            <text
              className="balance-scale__band-name"
              x={band.x + band.w / 2}
              y={plot.top - 10}
              textAnchor="middle"
              fontSize={m.labelFs}
            >
              {band.label}
            </text>
          )}
        </g>
      ))}
      {ticks.map((tick) => (
        <text
          key={tick.percent}
          className="balance-scale__tick"
          x={tick.x}
          y={plot.bottom + layout.metrics.tickGap}
          textAnchor={tick.anchor}
          fontSize={m.smallFs}
        >
          {`${tick.percent}%`}
        </text>
      ))}
    </>
  )
}

/** A lane's mark: a solid dot for a recorded grade, a ring over a bracketed band for an estimate. */
function Mark({ lane, layout }: { lane: LaneBox; layout: ScaleLayout }) {
  const { metrics: m } = layout
  return (
    <g data-sport={lane.sport} data-kind={lane.kind}>
      {lane.band === null ? null : (
        <>
          <rect
            className="balance-scale__range"
            x={lane.band.x1}
            y={lane.y - m.bandH / 2}
            width={Math.max(lane.band.x2 - lane.band.x1, m.bandH)}
            height={m.bandH}
            rx={m.bandH / 2}
          />
          {[lane.band.x1, lane.band.x2].map((x) => (
            <path
              key={x}
              className="balance-scale__cap"
              d={`M${x} ${lane.y - m.capH / 2}V${lane.y + m.capH / 2}`}
            />
          ))}
        </>
      )}
      <circle className={`balance-scale__${lane.kind}`} cx={lane.x} cy={lane.y} r={m.markR} />
    </g>
  )
}

/**
 * The gap between the two marks, and the ghost ring for the level target. The gap is one connector: a stem from
 * each mark and a bar between them, with no label in it, which the caption under the drawing says. The guide
 * line joins the ghost ring to the grade it matches.
 */
function Gap({ layout }: { layout: ScaleLayout }) {
  const { connector, ghost, metrics: m } = layout
  return (
    <>
      {ghost === null ? null : (
        <>
          <path
            className="balance-scale__guide"
            d={`M${ghost.guide.x} ${ghost.guide.y1}V${ghost.guide.y2}`}
          />
          <circle className="balance-scale__ghost" cx={ghost.x} cy={ghost.y} r={m.markR} />
        </>
      )}
      {connector === null ? null : (
        <path
          className="balance-scale__connector"
          d={`M${connector.x1} ${connector.y1}V${connector.y}H${connector.x2}V${connector.y2}`}
        />
      )}
    </>
  )
}

/** One lane's header text: the grade large, the line under the name beside it, and an estimate's range ends. */
function LaneText({
  lane,
  model,
  layout,
}: {
  lane: LaneBox
  model: ScaleModel
  layout: ScaleLayout
}) {
  const { metrics: m } = layout
  const data = model.lanes.find((candidate) => candidate.sport === lane.sport)
  if (data === undefined) return null
  const sub = { full: data.sub, short: data.subShort, level: data.level }[lane.subForm]
  return (
    <>
      <text className="balance-scale__big" {...at(lane.pct)} fontSize={m.bigFs}>
        {data.pct}
      </text>
      <text className="balance-scale__sub" {...at(lane.sub)} fontSize={m.smallFs}>
        {sub}
      </text>
      {lane.ranges.map((range) => (
        <text
          key={range.text}
          className="balance-scale__range-end"
          {...at(range)}
          fontSize={m.smallFs}
        >
          {range.text}
        </text>
      ))}
    </>
  )
}

/** A sport's name with its glyph, and whether its grade is recorded or estimated, at the lane's left. */
function LaneName({ lane, basis, size }: { lane: LaneBox; basis: string; size: number }) {
  const sport: Sport = lane.sport
  return (
    <p
      className="balance-scale__lane-name"
      data-sport={sport}
      style={{ left: lane.name.x, top: lane.name.y, fontSize: size }}
    >
      <SportIcon sport={sport} />
      <span className="balance-scale__sport">{SPORT_LABEL[sport]}</span>
      <span className="balance-scale__basis">{basis}</span>
    </p>
  )
}

/**
 * The key: a dot is recorded, a ring is estimated, a band is the 90% range. Where a ride's watts were measured and
 * only its level goes through the run equivalent, the ring says so, and "Estimated" is left for watts that were.
 */
function Legend({ viaEquivalent }: { viaEquivalent: boolean }) {
  return (
    <p className="balance-scale__legend">
      <span className="balance-scale__key">
        <i className="balance-scale__swatch balance-scale__swatch--dot" />
        Recorded
      </span>
      <span className="balance-scale__key">
        <i className="balance-scale__swatch balance-scale__swatch--ring" />
        {viaEquivalent ? (
          <Definition meaning={DEFINITIONS.viaEquivalent}>
            Power measured · level via run equivalent
          </Definition>
        ) : (
          <Definition meaning={DEFINITIONS.estimated}>Estimated</Definition>
        )}
      </span>
      <span className="balance-scale__key">
        <i className="balance-scale__swatch balance-scale__swatch--band" />
        90% range
      </span>
    </p>
  )
}

/**
 * Where you stand: both sports' age-graded level of the best 20 minutes on one scale, the hero of
 * Balance. The five level bands are neutral, so a sport's colour only ever marks that sport. A recorded
 * grade is a solid dot; an estimate is a ring over a bracketed band for its 90% range. One connector joins the
 * two marks, and the caption under the drawing says the gap in points and what the lower sport would need to
 * level, so no label sits in the drawing's rows. The figure is named, the drawing is described for a screen
 * reader, and its table twin is beneath it.
 */
export function BalanceScale({ model }: BalanceScaleProps) {
  const [stageRef, width] = useStageWidth()
  const layout = scaleLayout(model, width, rootFontPx())
  // On a phone the hero's sentence is its first clause, so the 90% range is defined here, where its figures are said.
  const phone = useNarrowScreen(BALANCE_PHONE_MAX_WIDTH_PX)
  return (
    <section className="balance-scale" aria-labelledby="balance-scale-title">
      <h2 id="balance-scale-title" className="balance-scale__title">
        Where you stand
      </h2>
      <p className="balance-scale__lede">
        Age-graded <Definition meaning={DEFINITIONS.level}>level</Definition> of your best{' '}
        {HEADLINE_LABEL}, on{' '}
        {model.lanes.length === 1 ? 'the scale every sport shares' : 'one scale for both sports'}.{' '}
        {levelEdgesText(layout.bands)}.
      </p>
      <Legend viaEquivalent={model.lanes.some((lane) => lane.basisText === VIA_EQUIVALENT)} />
      <figure className="balance-scale__figure" aria-labelledby="balance-scale-name">
        <figcaption id="balance-scale-name" className="sr-only">
          Level scale: age-graded level of your best {HEADLINE_LABEL}, by sport
        </figcaption>
        <div ref={stageRef} className="balance-scale__stage">
          <svg
            className="balance-scale__svg"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            role="img"
            aria-label={model.description}
            data-compact={layout.compact}
          >
            <Bands layout={layout} />
            {layout.lanes.map((lane) => (
              <path
                key={lane.sport}
                className="balance-scale__lane-line"
                d={`M0 ${lane.y}H${layout.width}`}
              />
            ))}
            <Gap layout={layout} />
            {layout.lanes.map((lane) => (
              <Mark key={lane.sport} lane={lane} layout={layout} />
            ))}
            {layout.lanes.map((lane) => (
              <LaneText key={lane.sport} lane={lane} model={model} layout={layout} />
            ))}
          </svg>
          {layout.lanes.map((lane) => (
            <LaneName
              key={lane.sport}
              lane={lane}
              size={layout.metrics.nameFs}
              basis={
                model.lanes.find((candidate) => candidate.sport === lane.sport)?.basisText ?? ''
              }
            />
          ))}
        </div>
        {model.gap === null && model.target === null ? null : (
          <div className="balance-scale__caption">
            {model.gap === null ? null : (
              <p className="balance-scale__lean">
                <i className="balance-scale__swatch balance-scale__swatch--bar" />
                <span>
                  {model.gap.side === SAME_GRADE
                    ? 'Same grade'
                    : `${model.gap.figure} ${model.gap.side}`}
                  {model.gap.rangeValue === '' ? null : (
                    <>
                      {' · '}
                      {phone ? (
                        <Definition meaning={DEFINITIONS.range90}>90% range</Definition>
                      ) : (
                        '90% range'
                      )}{' '}
                      {model.gap.rangeValue}
                    </>
                  )}
                </span>
              </p>
            )}
            {model.target === null ? null : (
              <p className="balance-scale__target">
                <i className="balance-scale__swatch balance-scale__swatch--ghost" />
                <span className="balance-scale__eyebrow-text">{model.target.eyebrow}</span>
                {model.target.line}
              </p>
            )}
          </div>
        )}
        <details className="balance-scale__details">
          <summary>View as table</summary>
          <ChartTable
            columns={SCALE_TABLE_COLUMNS}
            rows={model.rows}
            caption="Age-graded level of your best 20 min, by sport"
            textColumns={[0, 1, 3]}
          />
          {model.target === null ? null : (
            <p className="balance-scale__target-text">{model.target.sentence}</p>
          )}
        </details>
      </figure>
    </section>
  )
}
