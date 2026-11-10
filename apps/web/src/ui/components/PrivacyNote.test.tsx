// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PrivacyNote } from './PrivacyNote'
import { readStylesheet, ruleBody } from '../test/stylesheet'

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

  it('says nothing when signed in and saving works, keeping files or not: that is on the Privacy page', () => {
    for (const keepFiles of [true, false]) {
      const { container, unmount } = render(<PrivacyNote signedIn keepFiles={keepFiles} />)
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })

  it('says file storage is unavailable, without saying anything saved was deleted', () => {
    render(<PrivacyNote signedIn keepFiles fileRetentionAvailable={false} />)
    const note = screen.getByText(
      'Summaries are stored in your private library, and original file storage is unavailable here.',
    )
    expect(note).toBeInTheDocument()
    expect(note.textContent).not.toMatch(/delet|remov/)
  })

  it('does not say summaries are stored when the library is full', () => {
    for (const code of ['activity-quota', 'digest-quota'] as const) {
      const { unmount } = render(<PrivacyNote signedIn keepFiles issues={[{ code }]} />)
      expect(
        screen.getByText('Your library is full, so new summaries are not stored.'),
      ).toBeInTheDocument()
      expect(screen.queryByText(/stored in your private library/)).toBeNull()
      unmount()
    }
  })

  it('does not say summaries are stored while saving is paused', () => {
    for (const code of ['database-full', 'read-only'] as const) {
      const { unmount } = render(<PrivacyNote signedIn keepFiles issues={[{ code }]} />)
      expect(
        screen.getByText('Saving is paused, so new summaries are not stored yet.'),
      ).toBeInTheDocument()
      unmount()
    }
  })

  it('does not say original files are stored when their storage is full or paused', () => {
    for (const code of ['storage-quota', 'storage-budget'] as const) {
      const { unmount } = render(<PrivacyNote signedIn keepFiles issues={[{ code }]} />)
      expect(
        screen.getByText(
          'Summaries are stored in your private library, and new original files are not kept.',
        ),
      ).toBeInTheDocument()
      expect(screen.queryByText(/and original files are stored/)).toBeNull()
      unmount()
    }
  })

  it('puts a full library before a full file store when both are the case', () => {
    render(
      <PrivacyNote
        signedIn
        keepFiles
        issues={[{ code: 'storage-quota' }, { code: 'activity-quota' }]}
      />,
    )
    expect(
      screen.getByText('Your library is full, so new summaries are not stored.'),
    ).toBeInTheDocument()
  })

  it('says nothing for a failure that only waits on the connection', () => {
    const { container } = render(
      <PrivacyNote signedIn keepFiles issues={[{ code: 'network' }, { code: 'server' }]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('says nothing of the library to a visitor who is signed out, whatever failed', () => {
    render(<PrivacyNote signedIn={false} keepFiles issues={[{ code: 'activity-quota' }]} />)
    expect(
      screen.getByText('Your activities stay in this browser, where anyone using it can see them.'),
    ).toBeInTheDocument()
  })

  it('treats an omitted capability as available for older APIs: nothing to say', () => {
    const { container } = render(<PrivacyNote signedIn keepFiles />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/storage is unavailable/)).toBeNull()
  })

  it('is one sentence of about a dozen words in each state', () => {
    const states = [
      { signedIn: false, keepFiles: false },
      { signedIn: true, keepFiles: true, fileRetentionAvailable: false },
      { signedIn: true, keepFiles: true, issues: [{ code: 'activity-quota' as const }] },
      { signedIn: true, keepFiles: true, issues: [{ code: 'read-only' as const }] },
      { signedIn: true, keepFiles: true, issues: [{ code: 'storage-quota' as const }] },
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
