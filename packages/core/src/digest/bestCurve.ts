import { DURATIONS_S } from '../constants'
import { displaces, monotoneEnvelope } from '../curves'
import type { EffortPoint } from '../effort'
import type { ActivityDigest, Curve, DigestCurvePoint, Sport } from '../types'

/** A curve point of a digest found at a value: the shape every best is made of. */
function foundPoint(digest: ActivityDigest, point: DigestCurvePoint, value: number): EffortPoint {
  return {
    durationS: point.durationS,
    value,
    activityId: digest.id,
    startIndex: point.startIndex,
    windowS: point.windowS,
    heartRate: point.heartRate,
  }
}

/** A point where nothing is found. */
function unfound(durationS: number): EffortPoint {
  return {
    durationS,
    value: Number.NaN,
    activityId: null,
    startIndex: -1,
    windowS: null,
    heartRate: null,
  }
}

function emptyCurve(): EffortPoint[] {
  return DURATIONS_S.map(unfound)
}

/** Whether a digest's watts came from a power meter, so they are a measurement and not a model's output. */
export const isMeasured = (digest: ActivityDigest): boolean => digest.powerSource === 'measured'

/**
 * One sport's best curve, read in that sport's own number from the digests of that sport that `keep`
 * allows, which is all of them unless it says otherwise. `valueFor` gives the reading for one digest,
 * so a number that depends on the activity, such as its body mass, is looked up once per activity.
 *
 * The best at each duration is the pointwise best across the digests (see `displaces`: a value NaN is not found, and
 * that includes a run point the world-record ceiling dropped, which the monotone envelope may still refill from a
 * longer effort of the same activity, a demonstrated effort), then the monotone envelope. It is kept as the winner so
 * far at each duration, so only the winners are made into points, not every point of every digest. Empty when there
 * are no digests; their curves must all have the durations of the first.
 *
 * `aloneFor` names the points of a digest that stand at their own duration only: they are left out of the
 * monotone envelope, so they never fill a shorter duration, and are placed on the finished curve where they
 * beat what is there. An estimated ride point with no heart rate to back it is one (see ESTIMATED_RIDE).
 */
export function bestOfEach(
  ordered: ActivityDigest[],
  sport: Sport,
  valueFor: (digest: ActivityDigest) => (point: DigestCurvePoint) => number,
  keep: (digest: ActivityDigest) => boolean = () => true,
  aloneFor?: (digest: ActivityDigest) => (point: DigestCurvePoint) => boolean,
): EffortPoint[] {
  const digests = ordered.filter((d) => d.sport === sport && keep(d))
  const first = digests[0]
  if (first === undefined) return emptyCurve()
  const length = first.curve.length
  const bestValue = new Float64Array(length).fill(Number.NaN)
  const bestCarried: boolean[] = new Array<boolean>(length).fill(false)
  const winner: ({ digest: ActivityDigest; point: DigestCurvePoint } | undefined)[] = new Array<
    { digest: ActivityDigest; point: DigestCurvePoint } | undefined
  >(length)
  // The points that stand alone, at the duration they were found.
  const standing: EffortPoint[][] = aloneFor === undefined ? [] : Array.from({ length }, () => [])
  let anyStanding = false
  for (const digest of digests) {
    const curve = digest.curve
    if (
      curve.length !== length ||
      curve.some((p, i) => p.durationS !== first.curve[i]!.durationS)
    ) {
      throw new Error('mergeCurves: all curves must have the same durations in the same order')
    }
    const read = valueFor(digest)
    const alone = aloneFor?.(digest)
    for (let i = 0; i < length; i++) {
      const point = curve[i]!
      const value = read(point)
      if (Number.isNaN(value)) continue
      if (alone !== undefined && alone(point)) {
        standing[i]!.push(foundPoint(digest, point, value))
        anyStanding = true
        continue
      }
      const carried = point.windowS != null && point.windowS > point.durationS
      if (winner[i] === undefined || displaces(value, carried, bestValue[i]!, bestCarried[i]!)) {
        bestValue[i] = value
        bestCarried[i] = carried
        winner[i] = { digest, point }
      }
    }
  }
  const curve = monotoneEnvelope(
    first.curve.map((p, i) => {
      const found = winner[i]
      return found === undefined
        ? unfound(p.durationS)
        : foundPoint(found.digest, found.point, bestValue[i]!)
    }),
  )
  if (!anyStanding) return curve
  // Ascending, so a standing point is held to the finished curve at the nearest shorter duration with a value: the
  // curve stays non-increasing, and an estimate never reads higher than a shorter effort. Each candidate is held to it
  // before the best is taken, so a lower one stands when a higher one cannot.
  let shorter = Number.POSITIVE_INFINITY
  return curve.map((point, i) => {
    let placed = point
    for (const alone of standing[i]!) {
      if (alone.value <= shorter && !(alone.value <= placed.value)) placed = alone
    }
    if (!Number.isNaN(placed.value)) shorter = placed.value
    return placed
  })
}

/** bestOf for a reading that is the same for every activity. */
export function bestOf(
  ordered: ActivityDigest[],
  sport: Sport,
  value: (point: DigestCurvePoint) => number,
  keep: (digest: ActivityDigest) => boolean = () => true,
): EffortPoint[] {
  return bestOfEach(ordered, sport, () => value, keep)
}

export function plainCurve(points: EffortPoint[]): Curve {
  return points.map(({ durationS, value, activityId, startIndex, windowS }) => ({
    durationS,
    value,
    activityId,
    startIndex,
    windowS,
  }))
}
