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
