// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { lastAtOrBefore, nearestByPoint, nearestByX, stepActive } from './hover'

describe('nearestByX', () => {
  it('picks the position closest in x and ignores y', () => {
    expect(nearestByX([10, 50, 90], 58)).toBe(1)
    expect(nearestByX([10, 50, 90], -100)).toBe(0)
  })

  it('returns null when there are no positions', () => {
    expect(nearestByX([], 5)).toBeNull()
  })
})

describe('nearestByPoint', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 30, y: 40 },
  ]

  it('picks the nearest point within the radius', () => {
    expect(nearestByPoint(points, { x: 27, y: 37 }, 16)).toBe(1)
    expect(nearestByPoint(points, { x: 3, y: 4 }, 16)).toBe(0)
  })

  it('returns null when nothing is within the radius', () => {
    expect(nearestByPoint(points, { x: 15, y: 15 }, 16)).toBeNull()
  })
})

describe('stepActive', () => {
  it('starts at the first point on right and the last on left', () => {
    expect(stepActive(null, 4, 'ArrowRight')).toEqual({ index: 0 })
    expect(stepActive(null, 4, 'ArrowLeft')).toEqual({ index: 3 })
  })

  it('moves one step and stops at the ends', () => {
    expect(stepActive(1, 4, 'ArrowRight')).toEqual({ index: 2 })
    expect(stepActive(3, 4, 'ArrowRight')).toEqual({ index: 3 })
    expect(stepActive(0, 4, 'ArrowLeft')).toEqual({ index: 0 })
  })

  it('jumps to the first point on Home and the last on End', () => {
    expect(stepActive(2, 4, 'Home')).toEqual({ index: 0 })
    expect(stepActive(null, 4, 'End')).toEqual({ index: 3 })
    expect(stepActive(null, 0, 'Home')).toBeNull()
  })

  it('clears on Escape and ignores other keys', () => {
    expect(stepActive(2, 4, 'Escape')).toEqual({ index: null })
    expect(stepActive(2, 4, 'Enter')).toBeNull()
    expect(stepActive(null, 0, 'ArrowRight')).toBeNull()
  })
})

describe('lastAtOrBefore', () => {
  it('picks the last position at or before x, so a step holds its value until the next sample', () => {
    expect(lastAtOrBefore([10, 50, 90], 58)).toBe(1)
    expect(lastAtOrBefore([10, 50, 90], 50)).toBe(1)
    expect(lastAtOrBefore([10, 50, 90], 200)).toBe(2)
  })

  it('gives null before the first position, and for no positions', () => {
    expect(lastAtOrBefore([10, 50], 5)).toBeNull()
    expect(lastAtOrBefore([], 5)).toBeNull()
  })
})
