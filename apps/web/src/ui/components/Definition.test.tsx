// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { readStylesheet } from './stylesheet'
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
})
