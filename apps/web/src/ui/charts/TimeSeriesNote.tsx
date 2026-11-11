import { edgeReadings, hasClips } from './timeSeriesEdge'
import type { StackChannel, StackMark } from './timeSeriesTypes'

/**
 * The key under the plot: one entry for each kind of mark the window holds, so a mark is never left unexplained and a
 * key is never shown for one that is not there. How the lines are averaged is said in the readout row.
 */
export function TimeSeriesNote({
  channels,
  marks,
  startS,
  endS,
}: {
  channels: readonly StackChannel[]
  marks: readonly StackMark[]
  startS: number
  endS: number
}) {
  const inWindow = (from: number, to: number) => to > startS && from < endS
  const skipped = channels.some((channel) => channel.skipped.some(([a, b]) => inWindow(a, b)))
  const kinds = (['paused', 'unrecorded'] as const).filter((kind) =>
    marks.some((mark) => mark.kind === kind && inWindow(mark.startS, mark.endS)),
  )
  const clipped = channels.some(hasClips)
  if (!clipped && !skipped && kinds.length === 0) return null
  return (
    <p className="chart-frame__note ts-stack__note">
      {clipped && (
        <span className="ts-key">
          <span className="ts-key__swatch ts-key__swatch--edge" aria-hidden="true" />
          <Fact label="Beyond the edge" value={edgeKeyText(channels)} />
        </span>
      )}
      {skipped && (
        <span className="ts-key">
          <span className="ts-key__swatch ts-key__swatch--skipped" aria-hidden="true" />
          Reading left out
        </span>
      )}
      {kinds.includes('paused') && (
        <span className="ts-key">
          <span className="ts-key__swatch ts-key__swatch--paused" aria-hidden="true" />
          Paused
        </span>
      )}
      {kinds.includes('unrecorded') && (
        <span className="ts-key">
          <span className="ts-key__swatch ts-key__swatch--unrecorded" aria-hidden="true" />
          Not recorded
        </span>
      )}
    </p>
  )
}

/**
 * What the edge tick is, with the value: "heart rate 231 bpm high". A channel with readings past both edges gives both
 * ("pace 2:02 /km high, 27:47 /km low"), and several channels are joined, so the tick is never an unexplained mark.
 */
function edgeKeyText(channels: readonly StackChannel[]): string {
  const parts = channels.flatMap((channel) => {
    if (!hasClips(channel)) return []
    const { above, below } = edgeReadings(channel)
    const said = [
      ...(above === null ? [] : [`${above} high`]),
      ...(below === null ? [] : [`${below} low`]),
    ]
    return [`${channel.short.toLowerCase()} ${said.join(', ')}`]
  })
  return parts.join('; ')
}

/** One fact of the note, label over value: the label in serif, the value in mono. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span className="ts-fact">
      <span className="ts-fact__label">{label}</span>{' '}
      <span className="ts-fact__value">{value}</span>
    </span>
  )
}
