import { describe, expect, it } from 'vitest'
import { draggedRange } from './timeBrushModel'

describe('draggedRange', () => {
  it('rounds the anchor of a new brush to a whole second', () => {
    const origin = { startS: 0, endS: 100 }
    expect(draggedRange('new', origin, 10.4, 30, 100)).toEqual({ startS: 10, endS: 30 })
    expect(draggedRange('new', origin, 30, 10.6, 100)).toEqual({ startS: 11, endS: 30 })
  })
})
