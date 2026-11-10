// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusSection } from './methodContents'

afterEach(() => {
  document.body.replaceChildren()
})

describe('focusSection', () => {
  it('focuses the heading without the browser’s own scroll, then scrolls it to the top', () => {
    const heading = document.createElement('h2')
    heading.id = 'method-test'
    heading.tabIndex = -1
    document.body.append(heading)
    const calls: string[] = []
    const focus = vi.spyOn(heading, 'focus').mockImplementation(() => calls.push('focus'))
    heading.scrollIntoView = vi.fn(() => void calls.push('scroll'))

    focusSection('method-test')

    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(calls).toEqual(['focus', 'scroll'])
  })

  it('does nothing for an id that is not on the page', () => {
    expect(() => focusSection('method-missing')).not.toThrow()
  })
})
