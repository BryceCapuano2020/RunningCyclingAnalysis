/**
 * The path data of the icons the share card also draws. icons.tsx writes these as SVG and the card
 * draws them on canvas, so both show the same shapes. Each point is on the icon's own grid.
 */
export type PathStep =
  | { op: 'M'; x: number; y: number }
  | { op: 'L'; x: number; y: number }
  | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { op: 'Z' }

/** The SVG path data for the steps, for a path's d attribute. */
export function pathData(steps: readonly PathStep[]): string {
  return steps
    .map((step) => {
      switch (step.op) {
        case 'M':
        case 'L':
          return `${step.op}${step.x} ${step.y}`
        case 'C':
          return `C${step.x1} ${step.y1} ${step.x2} ${step.y2} ${step.x} ${step.y}`
        case 'Z':
          return 'Z'
      }
    })
    .join('')
}

/** The brand mark's running curve, on its 32 unit grid. */
export const BRAND_RUNNING: readonly PathStep[] = [
  { op: 'M', x: 5, y: 22 },
  { op: 'C', x1: 10, y1: 21, x2: 13, y2: 17, x: 16, y: 13 },
  { op: 'C', x1: 19, y1: 9, x2: 22, y2: 7, x: 27, y: 7 },
]

/** The brand mark's riding curve, on its 32 unit grid. */
export const BRAND_RIDING: readonly PathStep[] = [
  { op: 'M', x: 5, y: 12 },
  { op: 'C', x1: 10, y1: 12, x2: 13, y2: 15, x: 16, y: 18 },
  { op: 'C', x1: 19, y1: 21, x2: 22, y2: 24, x: 27, y: 24 },
]

/** The warning icon's triangle, its stem and its dot, on a 24 unit grid. */
export const WARNING_TRIANGLE: readonly PathStep[] = [
  { op: 'M', x: 12, y: 3.5 },
  { op: 'L', x: 22, y: 20.5 },
  { op: 'L', x: 2, y: 20.5 },
  { op: 'Z' },
]

export const WARNING_STEM: readonly PathStep[] = [
  { op: 'M', x: 12, y: 10 },
  { op: 'L', x: 12, y: 14.5 },
]

export const WARNING_DOT = { x: 12, y: 17.4, r: 0.6 } as const

/** A dot on a sport glyph's grid: a filled point, or a circle outlined in the glyph's stroke. */
export interface GlyphDot {
  cx: number
  cy: number
  r: number
  filled: boolean
}

/**
 * A sport's glyph on its 24 unit grid: its dots, then its stroked paths, each a list of steps. Its
 * stroke is the width its lines are drawn at, in the same grid units.
 */
export interface SportGlyph {
  dots: readonly GlyphDot[]
  paths: readonly (readonly PathStep[])[]
  strokeWidth: number
}

/**
 * The run and ride glyphs, drawn by icons.tsx as SVG and by the share card on canvas. The runner is
 * leaning forward, arms bent, one knee high and one leg stretched back: a walker's upright figure
 * reads as a pedestrian, and the app does not count walking. Checked at 16 and 24 px.
 */
export const SPORT_GLYPHS: Record<'run' | 'ride', SportGlyph> = {
  run: {
    strokeWidth: 2,
    dots: [{ cx: 15, cy: 4, r: 2, filled: true }],
    paths: [
      [
        { op: 'M', x: 13.5, y: 8.5 },
        { op: 'L', x: 11, y: 13.5 },
      ],
      [
        { op: 'M', x: 13.5, y: 9 },
        { op: 'L', x: 17, y: 10.5 },
        { op: 'L', x: 18.5, y: 8 },
      ],
      [
        { op: 'M', x: 13.5, y: 9 },
        { op: 'L', x: 10, y: 10.5 },
        { op: 'L', x: 7.5, y: 12.5 },
      ],
      [
        { op: 'M', x: 11, y: 13.5 },
        { op: 'L', x: 14.5, y: 15.5 },
        { op: 'L', x: 13.5, y: 20.5 },
      ],
      [
        { op: 'M', x: 11, y: 13.5 },
        { op: 'L', x: 8.5, y: 17 },
        { op: 'L', x: 4.5, y: 18.5 },
      ],
    ],
  },
  // Two wheels and a frame have more ink than the runner's five strokes at the same width, so the
  // ride is drawn a shade lighter and its wheels smaller. At 3.8 and 1.75 it carried about 1.65 times
  // the runner's ink at 16 to 30 px; at 3 and 1.5 it carries at most 1.3 times. The stroke is 1 px at
  // 16 px, which is as thin as it goes. The runner keeps its place on the grid: moving it was tried and widened its gap, so each box is cropped to its ink instead (inkBox).
  ride: {
    strokeWidth: 1.5,
    dots: [
      { cx: 5.5, cy: 16.5, r: 3, filled: false },
      { cx: 18.5, cy: 16.5, r: 3, filled: false },
    ],
    paths: [
      [
        { op: 'M', x: 5.5, y: 16.5 },
        { op: 'L', x: 9.5, y: 9.5 },
        { op: 'L', x: 16.5, y: 9.5 },
        { op: 'L', x: 18.5, y: 16.5 },
      ],
      [
        { op: 'M', x: 9.5, y: 9.5 },
        { op: 'L', x: 12.5, y: 16.5 },
        { op: 'L', x: 5.5, y: 16.5 },
      ],
      [
        { op: 'M', x: 14, y: 6 },
        { op: 'L', x: 17, y: 6 },
      ],
    ],
  },
}

/** A box on a glyph's grid: its top-left corner and its size, in the same units as the grid. */
export interface GlyphBox {
  x: number
  y: number
  width: number
  height: number
}

/** The points a path's steps pass through. A curve's control points count, since they bound it. */
function pointsOf(steps: readonly PathStep[]): [number, number][] {
  return steps.flatMap((step): [number, number][] => {
    switch (step.op) {
      case 'M':
      case 'L':
        return [[step.x, step.y]]
      case 'C':
        return [
          [step.x1, step.y1],
          [step.x2, step.y2],
          [step.x, step.y],
        ]
      case 'Z':
        return []
    }
  })
}

/**
 * The box a glyph's ink fills. A stroke's round caps and joins reach half its width past each point,
 * and an outlined dot reaches half its width past its radius, so each is grown by that much. The
 * icon's viewBox is this box, so the ink starts at the icon's own left edge, and the gap to a label
 * is the same for every glyph.
 */
export function inkBox(glyph: SportGlyph): GlyphBox {
  const half = glyph.strokeWidth / 2
  const edges: [number, number, number, number][] = [
    ...glyph.dots.map((dot): [number, number, number, number] => {
      const reach = dot.filled ? dot.r : dot.r + half
      return [dot.cx - reach, dot.cy - reach, dot.cx + reach, dot.cy + reach]
    }),
    ...glyph.paths.flatMap((steps) =>
      pointsOf(steps).map(([x, y]): [number, number, number, number] => [
        x - half,
        y - half,
        x + half,
        y + half,
      ]),
    ),
  ]
  const left = Math.min(...edges.map((edge) => edge[0]))
  const top = Math.min(...edges.map((edge) => edge[1]))
  const right = Math.max(...edges.map((edge) => edge[2]))
  const bottom = Math.max(...edges.map((edge) => edge[3]))
  return { x: left, y: top, width: right - left, height: bottom - top }
}
