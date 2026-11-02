import { meetsBoxes } from './chartBoxes'
import type { Box } from './chartBoxes'
import type { Point } from './chartTypes'
import { CANDIDATES, inside } from './annotationCandidates'
import type { Candidate } from './annotationCandidates'
import { CLEARANCE } from './annotationTypes'
import type { Annotation, AnnotationSpace, PlacedAnnotation } from './annotationTypes'

export type {
  Annotation,
  AnnotationSpace,
  AnnotationTone,
  Callout,
  EndLabel,
  PlacedAnnotation,
  PlacedText,
  ReferenceLine,
  TextRole,
} from './annotationTypes'
export { REFERENCE_VALUE_PX, splitValue, valuePx } from './annotationTypes'

/** The area of overlap of two boxes, 0 where they do not meet. */
function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left)
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
  return w > 0 && h > 0 ? w * h : 0
}

/** Reference lines claim their place first, then callouts, then end labels. */
const PRIORITY: Record<Annotation['kind'], number> = {
  reference: 0,
  callout: 1,
  end: 2,
}

/** How many of the boxes a candidate meets, and the area of their overlap: the cost of putting it there. */
function costOf(box: Box, taken: readonly Box[]): number {
  return taken.reduce((sum, other) => sum + overlapArea(box, other), 0)
}

/**
 * Where each annotation's text goes. In priority order, an annotation takes its first candidate place that
 * stays in the plot and keeps CLEARANCE from every box already placed and from the data's obstacles; where
 * none does, an optional annotation is left out and another takes the place that overlaps least, and says so in
 * `crowded`. The result is in the order of the input, without the annotations left out and without a repeated id.
 */
export function layoutAnnotations(
  annotations: readonly Annotation[],
  space: AnnotationSpace,
): PlacedAnnotation[] {
  const unique = annotations.filter(
    (annotation, i) => annotations.findIndex((other) => other.id === annotation.id) === i,
  )
  // A repeated id would draw one annotation and lose the other: the first stands, and development says so.
  if (unique.length !== annotations.length && import.meta.env.DEV) {
    console.warn(
      'layoutAnnotations: annotation ids must be unique; the repeated ones were left out',
    )
  }
  const taken: Box[] = [...(space.obstacles ?? [])]
  // The text boxes already placed, which a later leader line must not run through.
  const texts: Box[] = []
  const placed = new Map<string, PlacedAnnotation>()
  // Within a kind, what must be drawn is placed before what may be left out.
  const rank = (a: Annotation) => PRIORITY[a.kind] * 2 + (a.optional === true ? 1 : 0)
  const order = [...unique].sort((a, b) => rank(a) - rank(b))
  for (const annotation of order) {
    const candidates = (
      CANDIDATES[annotation.kind] as (a: Annotation, s: AnnotationSpace) => Candidate[]
    )(annotation, space)
    // A right-margin label may sit outside the plot sideways, but not above or below it; the others stay inside. Every
    // label stays within the chart's width, and none meets an axis label drawn in the plot.
    const fits = candidates.map(
      (candidate) =>
        (annotation.kind === 'reference' || annotation.kind === 'end'
          ? candidate.box.top >= space.plot.top && candidate.box.bottom <= space.plot.bottom
          : inside(candidate.box, space.plot)) &&
        candidate.box.left >= 0 &&
        candidate.box.right <= space.width &&
        !meetsBoxes(candidate.box, space.ticks ?? [], 0),
    )
    const free = candidates.findIndex(
      (candidate, i) =>
        fits[i] === true &&
        !meetsBoxes(candidate.box, taken, CLEARANCE) &&
        !leaderCrosses(candidate.leader, texts),
    )
    if (free < 0 && annotation.optional === true) continue
    // With no place that fits, the text is left out (a reference keeps its rule and band): the table twin has the value.
    const choice = free >= 0 ? free : fits.some(Boolean) ? cheapest(candidates, fits, taken) : -1
    const picked = choice < 0 ? bare(annotation, space) : candidates[choice]
    if (picked === undefined) continue
    if (choice < 0 && annotation.kind !== 'reference') continue
    taken.push(picked.box)
    texts.push(picked.box)
    // A reference line keeps the others off its rule and its band as well as off its label.
    if (annotation.kind === 'reference') {
      const edges = [annotation.y, annotation.band?.top, annotation.band?.bottom].filter(
        (edge): edge is number => edge !== undefined,
      )
      taken.push({
        left: space.plot.left,
        right: space.plot.right,
        top: Math.min(...edges) - 1,
        bottom: Math.max(...edges) + 1,
      })
    }
    placed.set(annotation.id, {
      id: annotation.id,
      kind: annotation.kind,
      tone: annotation.tone ?? 'neutral',
      texts: picked.texts,
      box: picked.box,
      leader: picked.leader ?? null,
      rule:
        annotation.kind === 'reference'
          ? { x1: space.plot.left, x2: space.plot.right, y: annotation.y }
          : null,
      band: annotation.kind === 'reference' ? (annotation.band ?? null) : null,
      estimated: annotation.kind === 'reference' && annotation.estimated === true,
      preferred: choice === 0,
      crowded: free < 0,
    })
  }
  return unique.flatMap((annotation) => placed.get(annotation.id) ?? [])
}

/** Whether a callout's leader line runs through the text of an annotation already placed. */
function leaderCrosses(leader: Candidate['leader'], placed: readonly Box[]): boolean {
  if (leader === undefined || leader === null) return false
  const along = lineObstacles(
    [
      { x: leader.x1, y: leader.y1 },
      { x: leader.x2, y: leader.y2 },
    ],
    2,
  )
  return along.some((piece) => meetsBoxes(piece, placed, 0))
}

/** A reference line with no room for its words: the rule and the band, and no text. */
function bare(annotation: Annotation, space: AnnotationSpace): Candidate | undefined {
  if (annotation.kind !== 'reference') return undefined
  const box = {
    left: space.plot.left,
    right: space.plot.left,
    top: annotation.y,
    bottom: annotation.y,
  }
  return { box, texts: [] }
}

function cheapest(
  candidates: readonly Candidate[],
  fits: readonly boolean[],
  taken: readonly Box[],
): number {
  let best = 0
  let bestCost = Infinity
  candidates.forEach((candidate, i) => {
    const cost = costOf(candidate.box, taken) + (fits[i] === true ? 0 : 1e6)
    if (cost < bestCost) {
      best = i
      bestCost = cost
    }
  })
  return best
}

/**
 * A polyline as thin boxes along its length, at the given thickness, so text keeps off a diagonal line as
 * it does off a flat one. Points that are null or not finite break the line.
 */
export function lineObstacles(
  points: ReadonlyArray<Point | null>,
  thickness = 5,
  step = thickness,
): Box[] {
  const half = thickness / 2
  const boxes: Box[] = []
  points.forEach((to, i) => {
    const from = points[i - 1]
    if (!to || !from) return
    if (![to.x, to.y, from.x, from.y].every(Number.isFinite)) return
    const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step))
    for (let k = 0; k <= steps; k += 1) {
      const x = from.x + ((to.x - from.x) * k) / steps
      const y = from.y + ((to.y - from.y) * k) / steps
      boxes.push({ left: x - half, right: x + half, top: y - half, bottom: y + half })
    }
  })
  return boxes
}

/** A point's marker as a box, for the obstacles. */
export function markerObstacle(at: Point, r: number): Box {
  return { left: at.x - r, right: at.x + r, top: at.y - r, bottom: at.y + r }
}
