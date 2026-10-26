// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { headerClearance, pickSpot, scrollToKeep, startsOnScreen } from './onScreen'

describe('startsOnScreen', () => {
  it('counts an element whose top edge is in the viewport as on screen', () => {
    expect(startsOnScreen(0, 768)).toBe(true)
    expect(startsOnScreen(767, 768)).toBe(true)
  })

  it('counts an element that starts below the viewport, or above it, as off screen', () => {
    expect(startsOnScreen(768, 768)).toBe(false)
    expect(startsOnScreen(-1, 768)).toBe(false)
  })

  it('counts an element under the sticky header as off screen, since the header covers it', () => {
    expect(startsOnScreen(40, 768, 69)).toBe(false)
    expect(startsOnScreen(69, 768, 69)).toBe(true)
  })

  it('reads the header height from the scroll padding the page keeps for it', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      scrollPaddingTop: '69px',
    } as CSSStyleDeclaration)
    expect(headerClearance()).toBe(69)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
})

describe('the place a pick is made from', () => {
  it('keeps the control where it was when the answer above it makes the page longer', () => {
    expect(scrollToKeep(pickSpot(400, 0, 800), 427, 0)).toBe(27)
  })

  it('moves the page back when the answer makes the text above the control shorter', () => {
    expect(scrollToKeep(pickSpot(400, 0, 800), 371, 0)).toBe(-29)
  })

  it('does not move the page when the control has not moved', () => {
    expect(scrollToKeep(pickSpot(400, 0, 800), 400, 0)).toBe(0)
  })

  it('does not move the page for a pick made while the control was out of view', () => {
    expect(pickSpot(900, 0, 800)).toBeNull()
    expect(scrollToKeep(pickSpot(900, 0, 800), 927, 0)).toBe(0)
  })

  it('does not move the page once the athlete has scrolled since the pick', () => {
    expect(scrollToKeep(pickSpot(400, 0, 800), 427, 150)).toBe(0)
  })
})
