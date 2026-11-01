// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PrivacyNote } from './PrivacyNote'
import { readStylesheet, ruleBody } from './stylesheet'

const noteCss = await readStylesheet(import.meta.url, './PrivacyNote.css')

afterEach(() => {
  cleanup()
})

/** The note's words, which stay near a dozen for each state. */
function noteWords(): number {
  return (screen.getByText(/\w/).textContent ?? '').trim().split(/\s+/).length
}

describe('PrivacyNote', () => {
  it('keeps the note to a 36rem measure beside the footer links', () => {
    expect(ruleBody(noteCss, '.privacy-note')).toMatch(/max-width:\s*36rem;/)
  })

  it('says activities stay in the browser, and who can see them, when signed out', () => {
    render(<PrivacyNote signedIn={false} keepFiles={false} />)
    expect(
      screen.getByText('Your activities stay in this browser, where anyone using it can see them.'),
    ).toBeInTheDocument()
  })

  it('ignores keepFiles when signed out', () => {
    render(<PrivacyNote signedIn={false} keepFiles />)
    expect(
      screen.getByText('Your activities stay in this browser, where anyone using it can see them.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/private library/)).toBeNull()
  })

  it('says summaries and original files are stored when signed in and keeping files', () => {
    render(<PrivacyNote signedIn keepFiles />)
    expect(
      screen.getByText('Summaries and original files are stored in your private library.'),
    ).toBeInTheDocument()
  })

  it('says original files are not kept when signed in without keeping files', () => {
    render(<PrivacyNote signedIn keepFiles={false} />)
    expect(
      screen.getByText(
        'Summaries are stored in your private library, and original files are not kept.',
      ),
    ).toBeInTheDocument()
  })

  it('says file storage is unavailable, without saying anything saved was deleted', () => {
    render(<PrivacyNote signedIn keepFiles fileRetentionAvailable={false} />)
    const note = screen.getByText(
      'Summaries are stored in your private library, and original file storage is unavailable here.',
    )
    expect(note).toBeInTheDocument()
    expect(note.textContent).not.toMatch(/delet|remov/)
  })

  it('treats an omitted capability as available for older APIs', () => {
    render(<PrivacyNote signedIn keepFiles />)
    expect(screen.getByText(/original files are stored/)).toBeInTheDocument()
  })

  it('is one sentence of about a dozen words in each state', () => {
    const states = [
      { signedIn: false, keepFiles: false },
      { signedIn: true, keepFiles: true },
      { signedIn: true, keepFiles: false },
      { signedIn: true, keepFiles: true, fileRetentionAvailable: false },
    ]
    for (const state of states) {
      const { unmount } = render(<PrivacyNote {...state} />)
      const text = screen.getByText(/\w/).textContent ?? ''
      expect(text.match(/[.!?]/g)).toHaveLength(1)
      expect(text).not.toContain(';')
      expect(noteWords()).toBeGreaterThanOrEqual(9)
      expect(noteWords()).toBeLessThanOrEqual(16)
      unmount()
    }
  })
})
