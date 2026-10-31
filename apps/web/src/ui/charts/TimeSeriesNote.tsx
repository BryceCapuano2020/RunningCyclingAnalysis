import { edgeReadings, hasClips } from './timeSeriesEdge'
import { windowText } from './timeSeriesModel'
import type { StackChannel, StackMark } from './timeSeriesTypes'

/**
 * The line under the plot: what the line and the band are, and a key for each kind of mark the window
 * holds, so a mark is never left unexplained and a key is never shown for one that is not there.
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
  const windowS = channels[0]?.columns.windowS
  const inWindow = (from: number, to: number) => to > startS && from < endS
  const skipped = channels.some((channel) => channel.skipped.some(([a, b]) => inWindow(a, b)))
  const kinds = (['paused', 'unrecorded'] as const).filter((kind) =>
    marks.some((mark) => mark.kind === kind && inWindow(mark.startS, mark.endS)),
  )
  const clipped = channels.some(hasClips)
  const bands = channels.some((channel) => channel.shape === 'line')
  return (
    <p className="chart-frame__note ts-stack__note">
      {windowS !== undefined && (
        <>
          Lines show {windowText(windowS)} averages
          {bands ? '; bands show the usual spread (10th to 90th percentile).' : '.'}
        </>
      )}
      {clipped && (
        <span className="ts-key">
          <span className="ts-key__swatch ts-key__swatch--edge" aria-hidden="true" />
          {edgeKeyText(channels)}
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
 * What the edge tick is, with the value: "Reading beyond the chart edge: heart rate reached 231 bpm". A channel with readings past
 * both edges says both ("reached 2:02 /km and fell to 27:47 /km"), and several channels are joined, so the tick is never an unexplained mark.
 */
function edgeKeyText(channels: readonly StackChannel[]): string {
  const parts = channels.flatMap((channel) => {
    if (!hasClips(channel)) return []
    const { above, below } = edgeReadings(channel)
    const said = [
      ...(above === null ? [] : [`reached ${above}`]),
      ...(below === null ? [] : [`fell to ${below}`]),
    ]
    return [`${channel.short.toLowerCase()} ${said.join(' and ')}`]
  })
  return `Reading beyond the chart edge: ${parts.join('; ')}`
}
