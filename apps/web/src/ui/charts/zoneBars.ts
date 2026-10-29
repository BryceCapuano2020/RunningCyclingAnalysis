import { percentText } from '../zoneTimeCopy'

/** The least room, px, a share's text needs besides its characters. */
const PERCENT_PAD = 12
const PERCENT_EM = 0.55

/** A segment of a bar: its zone (1 is the lowest effort), where it starts and how wide it is. */
export interface Segment {
  level: number
  left: number
  width: number
  share: number
}

/** The segments of a bar, left to right across the width, with the zone each stands for. Empty zones have none. */
export function segmentsOf(seconds: readonly number[], width: number): Segment[] {
  const total = seconds.reduce((a, b) => a + b, 0)
  const lefts = seconds.map((_, i) => seconds.slice(0, i).reduce((a, b) => a + b, 0))
  return seconds.flatMap((each, i) =>
    each > 0 && total > 0
      ? [
          {
            level: i + 1,
            left: (lefts[i]! / total) * width,
            width: (each / total) * width,
            share: each / total,
          },
        ]
      : [],
  )
}

/**
 * Whether the share's percent fits inside its segment at the display size: it is left out of a sliver
 * rather than overflow it. The numbers under the bar and the table say every zone's share.
 */
export function percentFits(text: string, segmentWidth: number, rootPx: number): boolean {
  const widthPx = text.length * 20 * PERCENT_EM * (rootPx / 16)
  return segmentWidth >= widthPx + PERCENT_PAD
}

/** "31% easy · 28% hard": the bar's takeaway, from the shares of the time that were easy and hard. */
export function takeawayText({ easy, hard }: { easy: number; hard: number }): string {
  return `${percentText(easy)} easy · ${percentText(hard)} hard`
}
