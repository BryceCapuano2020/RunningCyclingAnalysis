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

/** A label under a bar: the zone's number, or its number and name, centred on x. */
export interface UnderLabel {
  level: number
  text: string
  x: number
}

/** The gap kept between two labels under a bar, px. */
const LABEL_GAP = 6
/** How far a label may reach past its own segment on each side, px, so it still reads as that segment's. */
const OVERHANG = 8
/** A segment narrower than this, px, has no label: its number would be taken for a neighbour's. */
const LABEL_MIN_SEGMENT = 10
const LABEL_GLYPH_EM = 0.52

/**
 * The labels under a bar. Every segment that can show its number and name does: the widest are placed first,
 * a label may reach a little past its segment into room a neighbour leaves empty, and a segment that cannot
 * hold its name shows its number alone, where that fits, rather than nothing or a clipped name. No two labels
 * touch. `rootPx` sets the text's size, which follows the reader's own.
 */
export function underLabels(
  segments: readonly Segment[],
  names: readonly string[] | undefined,
  width: number,
  rootPx: number,
): UnderLabel[] {
  const size = 0.75 * rootPx
  const widthOf = (text: string) => text.length * size * LABEL_GLYPH_EM
  const taken: { left: number; right: number }[] = []
  const placed: UnderLabel[] = []
  const free = (left: number, right: number) =>
    left >= 0 &&
    right <= width &&
    taken.every((box) => right + LABEL_GAP <= box.left || left >= box.right + LABEL_GAP)
  for (const segment of [...segments].sort((a, b) => b.width - a.width)) {
    if (segment.width < LABEL_MIN_SEGMENT) continue
    const name = names?.[segment.level - 1]
    const options = [
      ...(name === undefined ? [] : [`${segment.level} ${name}`]),
      String(segment.level),
    ]
    const centre = segment.left + segment.width / 2
    for (const text of options) {
      const w = widthOf(text)
      if (w > segment.width + 2 * OVERHANG) continue
      // Near an end of the bar the label slides in to stay on it.
      const left = Math.min(Math.max(centre - w / 2, 0), width - w)
      if (!free(left, left + w)) continue
      taken.push({ left, right: left + w })
      placed.push({ level: segment.level, text, x: left + w / 2 })
      break
    }
  }
  return placed.sort((a, b) => a.level - b.level)
}
