// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PAGE_HEADING_ID } from './pageHeading'
import { askHeadingFocus, useHeadingFocusWhen } from './useHeadingFocus'

afterEach(() => {
  cleanup()
})

function Page({ settled }: { settled: boolean }) {
  useHeadingFocusWhen(settled)
  return (
    <h1 id={PAGE_HEADING_ID} tabIndex={-1}>
      Heading
    </h1>
  )
}

describe('useHeadingFocusWhen', () => {
  it('moves focus to the heading when the page settles after a press asked for it, once', () => {
    const view = render(<Page settled={false} />)
    askHeadingFocus()
    expect(screen.getByRole('heading')).not.toHaveFocus()

    view.rerender(<Page settled />)
    expect(screen.getByRole('heading')).toHaveFocus()

    ;(document.activeElement as HTMLElement).blur()
    view.rerender(<Page settled={false} />)
    view.rerender(<Page settled />)
    expect(screen.getByRole('heading')).not.toHaveFocus()
  })

  it('does nothing when no press asked', () => {
    const view = render(<Page settled={false} />)
    view.rerender(<Page settled />)
    expect(screen.getByRole('heading')).not.toHaveFocus()
  })

  it('drops the request when the page changes before it settles', () => {
    const view = render(<Page settled={false} />)
    askHeadingFocus()
    act(() => window.dispatchEvent(new HashChangeEvent('hashchange')))
    view.rerender(<Page settled />)
    expect(screen.getByRole('heading')).not.toHaveFocus()
  })
})
