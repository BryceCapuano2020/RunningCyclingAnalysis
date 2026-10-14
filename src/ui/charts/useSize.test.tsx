// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useSize } from './useSize'

function Probe() {
  const [ref, width] = useSize()
  return <div ref={ref}>width {width}</div>
}

describe('useSize', () => {
  afterEach(() => {
    cleanup()
  })

  it('falls back to 640 when ResizeObserver is unavailable', () => {
    render(<Probe />)
    expect(screen.getByText('width 640')).toBeInTheDocument()
  })
})
