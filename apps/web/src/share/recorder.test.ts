import { describe, expect, it } from 'vitest'
import { FakeContext } from './fixtures'

describe('the recording canvas', () => {
  it('records a filled and a stroked path with its commands, so a card drawing one fails the no-marks check', () => {
    const ctx = new FakeContext()
    ctx.fillStyle = '#111111'
    ctx.beginPath()
    ctx.moveTo()
    ctx.lineTo()
    ctx.bezierCurveTo()
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#222222'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(10, 20, 5)
    ctx.stroke()
    expect(ctx.paths).toEqual([
      {
        op: 'fill',
        color: '#111111',
        width: 0,
        alpha: 1,
        segments: ['moveTo', 'lineTo', 'bezierCurveTo', 'closePath'],
      },
      { op: 'stroke', color: '#222222', width: 3, alpha: 1, segments: ['arc'] },
    ])
    expect(ctx.arcs).toEqual([{ x: 10, y: 20, r: 5 }])
  })
})
