// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mediaBlock, readStylesheet, ruleBody } from './stylesheet'
import { Definition } from './Definition'

const css = await readStylesheet(import.meta.url, './Definition.css')

afterEach(cleanup)

const MEANING = 'Your pace, scored against the standard for your age and sex.'

function noteOf(button: HTMLElement): HTMLElement {
  const note = document.getElementById(button.getAttribute('aria-controls') ?? '')
  if (note === null) throw new Error('The button controls nothing')
  return note
}

describe('Definition', () => {
  it('is a button named by the term, closed, that controls a note holding the meaning', () => {
    render(
      <p>
        An <Definition meaning={MEANING}>age grade</Definition> of 64%.
      </p>,
    )
    const button = screen.getByRole('button', { name: 'age grade' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('type', 'button')
    expect(noteOf(button)).toHaveTextContent(MEANING)
    expect(noteOf(button)).toHaveAttribute('role', 'note')
  })

  it('opens on a press and closes on the next', () => {
    render(<Definition meaning={MEANING}>age grade</Definition>)
    const button = screen.getByRole('button', { name: 'age grade' })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button.closest('.definition')).toHaveAttribute('data-open', 'true')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on Escape, and when the page is pressed elsewhere', () => {
    render(
      <div>
        <Definition meaning={MEANING}>age grade</Definition>
        <p>elsewhere</p>
      </div>,
    )
    const button = screen.getByRole('button', { name: 'age grade' })
    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(button)
    fireEvent.pointerDown(screen.getByText('elsewhere'))
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('stays open when its own note is pressed, so the meaning can be read and selected', () => {
    render(<Definition meaning={MEANING}>age grade</Definition>)
    const button = screen.getByRole('button', { name: 'age grade' })
    fireEvent.click(button)
    fireEvent.pointerDown(noteOf(button))
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('gives each term its own note, so two definitions in one sentence stay apart', () => {
    render(
      <p>
        <Definition meaning="First.">one</Definition> and{' '}
        <Definition meaning="Second.">two</Definition>
      </p>,
    )
    const [one, two] = [
      screen.getByRole('button', { name: 'one' }),
      screen.getByRole('button', { name: 'two' }),
    ]
    expect(one.getAttribute('aria-controls')).not.toBe(two.getAttribute('aria-controls'))
    fireEvent.click(one)
    expect(two).toHaveAttribute('aria-expanded', 'false')
  })

  describe('by pointer', () => {
    it('shows the note while a pointer rests on the term, and hides it when the pointer leaves', () => {
      render(<Definition meaning={MEANING}>age grade</Definition>)
      const button = screen.getByRole('button', { name: 'age grade' })
      const root = button.closest('.definition') as HTMLElement
      fireEvent.mouseEnter(root)
      expect(root).toHaveAttribute('data-open', 'true')
      expect(button).toHaveAttribute('aria-expanded', 'true')
      fireEvent.mouseLeave(root)
      expect(root).toHaveAttribute('data-open', 'false')
    })

    it('keeps a pressed note open when the pointer leaves, since a press stays until it is closed', () => {
      render(<Definition meaning={MEANING}>age grade</Definition>)
      const button = screen.getByRole('button', { name: 'age grade' })
      const root = button.closest('.definition') as HTMLElement
      fireEvent.click(button)
      fireEvent.mouseEnter(root)
      fireEvent.mouseLeave(root)
      expect(root).toHaveAttribute('data-open', 'true')
    })

    it('is closed by Escape even while a pointer rests on it', () => {
      render(<Definition meaning={MEANING}>age grade</Definition>)
      const root = screen
        .getByRole('button', { name: 'age grade' })
        .closest('.definition') as HTMLElement
      fireEvent.mouseEnter(root)
      expect(root).toHaveAttribute('data-open', 'true')
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(root).toHaveAttribute('data-open', 'false')
    })

    it('has no stylesheet rule of its own for hover: the state decides, so a keyboard and a pointer agree', () => {
      expect(css).not.toMatch(/:hover/)
      expect(css).toMatch(/\.definition\[data-open='true'\] \.definition__note/)
    })

    it('joins the note to the term with no gap a pointer could fall through', () => {
      expect(css).toMatch(/\.definition__note::before \{[^}]*content:/)
    })
  })

  it('closes when focus leaves the term, and stays open while focus moves inside it', () => {
    render(
      <div>
        <Definition meaning={MEANING}>age grade</Definition>
        <button type="button">next</button>
      </div>,
    )
    const button = screen.getByRole('button', { name: 'age grade' })
    fireEvent.click(button)
    fireEvent.blur(button, { relatedTarget: noteOf(button) })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    fireEvent.blur(button, { relatedTarget: screen.getByRole('button', { name: 'next' }) })
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes the others when one opens, by a press or by a pointer', () => {
    render(
      <p>
        <Definition meaning="First.">one</Definition> <Definition meaning="Second.">two</Definition>{' '}
        <Definition meaning="Third.">three</Definition>
      </p>,
    )
    const [one, two, three] = ['one', 'two', 'three'].map((name) =>
      screen.getByRole('button', { name }),
    ) as [HTMLElement, HTMLElement, HTMLElement]
    fireEvent.click(one)
    fireEvent.click(two)
    expect(one).toHaveAttribute('aria-expanded', 'false')
    expect(two).toHaveAttribute('aria-expanded', 'true')
    fireEvent.mouseEnter(three.closest('.definition') as HTMLElement)
    expect(two).toHaveAttribute('aria-expanded', 'false')
    expect(three).toHaveAttribute('aria-expanded', 'true')
  })

  describe('placement', () => {
    /** Makes the term's box and the note's height what a browser would measure, which jsdom has no layout for. */
    function measure(
      term: { top: number; bottom: number },
      noteHeight: number,
      windowHeight = 800,
    ) {
      Object.defineProperty(window, 'innerHeight', { value: windowHeight, configurable: true })
      const rect = (box: Partial<DOMRect>) =>
        ({ left: 0, right: 100, width: 100, ...box }) as DOMRect
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.classList.contains('definition__note')
          ? rect({ top: 0, bottom: noteHeight, height: noteHeight })
          : rect({ top: term.top, bottom: term.bottom, height: term.bottom - term.top })
      })
    }

    afterEach(() => vi.restoreAllMocks())

    it('opens under the term when the window has room under it', () => {
      measure({ top: 100, bottom: 120 }, 90)
      render(<Definition meaning={MEANING}>age grade</Definition>)
      const button = screen.getByRole('button', { name: 'age grade' })
      fireEvent.click(button)
      expect(button.closest('.definition')).toHaveAttribute('data-placement', 'below')
    })

    it('opens over the term only when there is no room under it and there is above', () => {
      measure({ top: 700, bottom: 720 }, 90)
      render(<Definition meaning={MEANING}>age grade</Definition>)
      const button = screen.getByRole('button', { name: 'age grade' })
      fireEvent.click(button)
      expect(button.closest('.definition')).toHaveAttribute('data-placement', 'above')
    })

    it('stays under the term when there is no more room above than below', () => {
      measure({ top: 20, bottom: 40 }, 900, 800)
      render(<Definition meaning={MEANING}>age grade</Definition>)
      const button = screen.getByRole('button', { name: 'age grade' })
      fireEvent.click(button)
      expect(button.closest('.definition')).toHaveAttribute('data-placement', 'below')
    })

    it('is a sheet at the foot of the window under 480 px, and a press target of 44 px or more everywhere', () => {
      const phone = mediaBlock(css, '(max-width: 479px)')
      expect(phone).toMatch(/position:\s*fixed/)
      expect(phone).toMatch(/inset:\s*auto 0 0/)
      // The pseudo-element reaches 12 px past the line above and below, which a 20 px line makes 44.
      expect(ruleBody(css, '.definition__term::after')).toMatch(/inset:\s*-12px -6px/)
      expect(ruleBody(css, '.definition__term')).toMatch(/position:\s*relative/)
    })
  })
})
