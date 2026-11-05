import { labelSizePx } from '../charts/rootFont'

/** A level's band on the scale, by its name and its edges in percent of the bar's width. */
export interface NamedBand {
  name: string
  from: number
  to: number
}

/**
 * The mono meta face's width of a character, in em of its size: the glyph and the 0.12em tracking. An estimate from the
 * face's advance width, since jsdom cannot lay text out; the browser runs are the check.
 */
const META_CHAR_EM = 0.6 + 0.12
/** The meta size is --text-meta, 11 px against the 12 px label size labelSizePx gives. */
const META_OF_LABEL = 11 / 12
/** The room kept between a name and the next band's tick. */
const GAP_PX = 6

/** A level name's width in px at the reader's root text size. */
export function nameWidthPx(name: string, rootPx: number): number {
  return name.length * META_CHAR_EM * labelSizePx(rootPx) * META_OF_LABEL
}

/**
 * Whether every level's name fits on one line under its own tick: each starts at its band's lower edge and must end
 * before the next band's. When one does not, the ladder names only the current level, under the mark.
 */
export function namesFit(bands: readonly NamedBand[], widthPx: number, rootPx: number): boolean {
  return bands.every(
    (band) => nameWidthPx(band.name, rootPx) + GAP_PX <= ((band.to - band.from) / 100) * widthPx,
  )
}

/**
 * How the current level's name sits under the mark when it is named alone: centred on it, or held to the bar's start
 * or end where centring would run it past an edge.
 */
export function aloneAlignment(
  name: string,
  atPercent: number,
  widthPx: number,
  rootPx: number,
): 'start' | 'centre' | 'end' {
  const half = nameWidthPx(name, rootPx) / 2
  const at = (atPercent / 100) * widthPx
  if (at - half < 0) return 'start'
  return at + half > widthPx ? 'end' : 'centre'
}
