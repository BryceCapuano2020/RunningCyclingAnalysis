import { describe, expect, it } from 'vitest'
import type { GpsFix } from '../import/gps'
import { MAX_ROUTE_POINTS, parseRouteShape, routeFromFixes, routeShape } from './routeShape'
import type { RouteShape } from './routeShape'

const EARTH_RADIUS_M = 6_371_008.8
const LAT0 = 51.5012
const LON0 = -0.1234

/** A position `east` and `north` metres from (LAT0, LON0), on the sphere the module projects with. */
function at(east: number, north: number, lat0 = LAT0, lon0 = LON0) {
  const lat = lat0 + (north / EARTH_RADIUS_M) * (180 / Math.PI)
  const lon = lon0 + (east / (EARTH_RADIUS_M * Math.cos((lat0 * Math.PI) / 180))) * (180 / Math.PI)
  return { lat, lon }
}

/** A closed loop through the corners, with `per` points along each side. */
function loop(corners: [number, number][], per = 20, lat0 = LAT0, lon0 = LON0) {
  const out: { lat: number; lon: number }[] = []
  corners.forEach(([x0, y0], i) => {
    const [x1, y1] = corners[(i + 1) % corners.length]!
    for (let k = 0; k < per; k++) {
      out.push(at(x0 + ((x1 - x0) * k) / per, y0 + ((y1 - y0) * k) / per, lat0, lon0))
    }
  })
  return out
}

/** A deterministic random walk of `count` points, about 10 m apart. */
function walk(count: number): { lat: number; lon: number }[] {
  let seed = 7
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648 - 0.5
  }
  const out: { lat: number; lon: number }[] = []
  let east = 0
  let north = 0
  for (let i = 0; i < count; i++) {
    east += next() * 20
    north += next() * 20
    out.push(at(east, north))
  }
  return out
}

function fixesOf(points: { lat: number; lon: number }[], startMs = 0, stepMs = 1000): GpsFix[] {
  return points.map((p, i) => ({ t: startMs + i * stepMs, lat: p.lat, lon: p.lon }))
}

function bounds(points: [number, number][]) {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  }
}

function shapeOf(points: { lat: number; lon: number }[]): RouteShape {
  const shape = routeShape(points)
  if (shape === null) throw new Error('expected a route shape')
  return shape
}

describe('routeShape', () => {
  it('keeps a square loop square', () => {
    const shape = shapeOf(
      loop([
        [0, 0],
        [400, 0],
        [400, 400],
        [0, 400],
      ]),
    )

    const box = bounds(shape.points)
    expect(shape.aspect).toBeCloseTo(1, 2)
    expect(box.maxX - box.minX).toBeCloseTo(1, 2)
    expect(box.maxY - box.minY).toBeCloseTo(1, 2)
  })

  it('keeps the aspect ratio of a wide track, with its longer side across the unit box', () => {
    const shape = shapeOf(
      loop([
        [0, 0],
        [800, 0],
        [800, 400],
        [0, 400],
      ]),
    )

    const box = bounds(shape.points)
    expect(shape.aspect).toBeCloseTo(2, 2)
    expect(box.maxX).toBeCloseTo(1, 2)
    expect(box.maxY).toBeCloseTo(0.5, 2)
  })

  it('keeps the aspect ratio of a tall track', () => {
    const shape = shapeOf(
      loop([
        [0, 0],
        [300, 0],
        [300, 900],
        [0, 900],
      ]),
    )

    const box = bounds(shape.points)
    expect(shape.aspect).toBeCloseTo(1 / 3, 2)
    expect(box.maxY).toBeCloseTo(1, 2)
    expect(box.maxX).toBeCloseTo(1 / 3, 2)
  })

  it('simplifies a long track to at most the point cap', () => {
    const shape = shapeOf(walk(5000))

    expect(shape.points.length).toBeGreaterThanOrEqual(2)
    expect(shape.points.length).toBeLessThanOrEqual(MAX_ROUTE_POINTS)
    expect(MAX_ROUTE_POINTS).toBe(256)
  })

  it('handles a track far longer than a call can take as arguments', () => {
    const shape = shapeOf(walk(300_000))

    expect(shape.points.length).toBeLessThanOrEqual(MAX_ROUTE_POINTS)
  })

  it('rounds every point to three decimals inside the unit box', () => {
    const shape = shapeOf(walk(500))

    for (const [x, y] of shape.points) {
      expect(Math.round(x * 1000)).toBeCloseTo(x * 1000, 6)
      expect(Math.round(y * 1000)).toBeCloseTo(y * 1000, 6)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
  })

  it('is the same shape wherever the track is', () => {
    const here = shapeOf(
      loop([
        [0, 0],
        [400, 0],
        [400, 200],
        [0, 200],
      ]),
    )
    const elsewhere = shapeOf(
      loop(
        [
          [0, 0],
          [400, 0],
          [400, 200],
          [0, 200],
        ],
        20,
        -33.87,
        151.21,
      ),
    )

    expect(elsewhere).toEqual(here)
  })

  it('returns null for no points, or fewer than two valid ones', () => {
    expect(routeShape([])).toBeNull()
    expect(routeShape([at(0, 0)])).toBeNull()
    expect(
      routeShape([{ lat: Number.NaN, lon: LON0 }, { lat: 91, lon: LON0 }, at(100, 0)]),
    ).toBeNull()
  })

  it('returns null when the whole track fits within 50 m', () => {
    expect(
      routeShape(
        loop([
          [0, 0],
          [20, 0],
          [20, 20],
          [0, 20],
        ]),
      ),
    ).toBeNull()
    expect(routeShape([at(0, 0), at(30, 0)])).toBeNull()
  })

  it('keeps a straight track, with a finite positive aspect', () => {
    const shape = shapeOf([at(0, 0), at(0, 1000)])

    expect(shape.aspect).toBeGreaterThan(0)
    expect(Number.isFinite(shape.aspect)).toBe(true)
    expect(shape.points.every(([x]) => x === 0)).toBe(true)
  })

  it('carries no input coordinate in its output', () => {
    const input = walk(300)
    const shape = shapeOf(input)
    const inputs = new Set(input.flatMap((p) => [p.lat, p.lon]))

    const outputs = [shape.aspect, ...shape.points.flat()]
    expect(outputs.filter((value) => inputs.has(value))).toEqual([])
    expect(Object.keys(shape).sort()).toEqual(['aspect', 'points'])
  })
})

describe('routeShape across the antimeridian and at any size', () => {
  it('reads a track that crosses the antimeridian as the same shape as one that does not', () => {
    const corners: [number, number][] = [
      [0, 0],
      [400, 0],
      [400, 200],
      [0, 200],
    ]
    const away = shapeOf(loop(corners, 20, 10, 0))
    const across = loop(corners, 20, 10, 179.999).map(({ lat, lon }) => ({
      lat,
      lon: lon > 180 ? lon - 360 : lon,
    }))

    expect(across.some(({ lon }) => lon < 0)).toBe(true)
    expect(shapeOf(across)).toEqual(away)
  })

  it('draws the same outline at any size', () => {
    const corners: [number, number][] = [
      [0, 0],
      [400, 0],
      [400, 200],
      [0, 200],
    ]
    const large = corners.map(([x, y]): [number, number] => [x * 10, y * 10])

    expect(shapeOf(loop(large))).toEqual(shapeOf(loop(corners)))
  })
})

describe('parseRouteShape', () => {
  const valid = {
    points: [
      [0, 0],
      [1, 0.5],
    ],
    aspect: 2,
  }

  it('reads a valid shape', () => {
    expect(parseRouteShape(valid)).toEqual(valid)
  })

  it.each([
    ['not an object', 'shape'],
    ['null', null],
    ['no points', { aspect: 2 }],
    ['one point', { points: [[0, 0]], aspect: 1 }],
    [
      'too many points',
      { points: Array.from({ length: MAX_ROUTE_POINTS + 1 }, () => [0, 0]), aspect: 1 },
    ],
    [
      'a point outside the unit box',
      {
        points: [
          [0, 0],
          [1.5, 0],
        ],
        aspect: 1,
      },
    ],
    [
      'a point that is not a number',
      {
        points: [
          [0, 0],
          [Number.NaN, 0],
        ],
        aspect: 1,
      },
    ],
    [
      'a zero aspect',
      {
        points: [
          [0, 0],
          [1, 1],
        ],
        aspect: 0,
      },
    ],
    [
      'an aspect that is not a number',
      {
        points: [
          [0, 0],
          [1, 1],
        ],
        aspect: '1',
      },
    ],
  ])('rejects %s', (_, value) => {
    expect(parseRouteShape(value)).toBeNull()
  })
})

describe('routeFromFixes', () => {
  const window = loop([
    [0, 0],
    [400, 0],
    [400, 400],
    [0, 400],
  ])

  it('uses only the fixes inside the window', () => {
    const fixes = [...fixesOf(window, 0), ...fixesOf([at(90_000, 0)], 9_000_000)]

    expect(routeFromFixes(fixes, 0, window.length * 1000, 12.5)).toEqual(shapeOf(window))
  })

  it('drops a fix that implies an impossible speed', () => {
    const fixes = fixesOf(window)
    const spike = {
      t: fixes[40]!.t + 500,
      lat: at(50_000, 50_000).lat,
      lon: at(50_000, 50_000).lon,
    }
    const withSpike = [...fixes, spike].sort((a, b) => a.t - b.t)

    expect(routeFromFixes(withSpike, 0, window.length * 1000, 12.5)).toEqual(shapeOf(window))
  })

  it('returns null when no fix falls in the window', () => {
    expect(routeFromFixes(fixesOf(window), 10_000_000, 20_000_000, 12.5)).toBeNull()
  })
})
