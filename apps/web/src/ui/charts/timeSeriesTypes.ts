import type { SeriesColumns } from './timeSeriesModel'

/** Which colour token a channel is drawn in. The CSS maps each to its `--ch-*` pair. */
export type ChannelColour = 'pace' | 'power' | 'heartrate' | 'cadence' | 'elevation' | 'neutral'

/** What a channel reads at the cursor: the value as it is drawn, and the words for it. */
export interface ChannelReading {
  /** The value in the channel's own unit, where the cursor's marker sits on the line. */
  raw: number
  /** The number as written, such as 5:03 or 152. */
  value: string
  unit: string
}

/** A tick on a channel's value axis. */
export interface ValueTick {
  /** The reading it sits at, in the channel's own unit. */
  value: number
  label: string
}

/** One channel of the stack: its reduced readings, its axis and the words it reads out. */
export interface StackChannel {
  key: string
  label: string
  /** The name in the readout and on the row, where room is short. */
  short: string
  unit: string
  colour: ChannelColour
  /** A line, or a line with the area beneath it filled, as for elevation. */
  shape: 'line' | 'area'
  /** The row's height relative to the stack's base row. */
  weight: number
  /** The axis's lowest and highest reading. A reading past either is drawn on its edge, with a mark. */
  low: number
  high: number
  ticks: ValueTick[]
  columns: SeriesColumns
  /** The reading at the whole second, or null where the channel has none. */
  at: (second: number) => ChannelReading | null
  /** The average over the selection, for the readout while there is no cursor. */
  average: { value: string; unit: string } | null
  /** Stretches of seconds whose readings the analysis left out, drawn as ticks on the row. */
  skipped: readonly [number, number][]
}

/** A stretch with no usable readings in any channel, drawn on the timeline under the rows. */
export interface StackMark {
  kind: 'paused' | 'unrecorded'
  startS: number
  endS: number
}

/** The words at the head of the readout: the cursor's time, and its distance when there is one. */
export interface CursorHead {
  time: string
  distance: string | null
}
