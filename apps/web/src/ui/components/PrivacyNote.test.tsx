// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PrivacyNote } from './PrivacyNote'
import { readStylesheet, ruleBody } from './stylesheet'

const noteCss = await readStylesheet(import.meta.url, './PrivacyNote.css')

afterEach(() => {
  cleanup()
})

describe('PrivacyNote', () => {
  it('keeps the note to a 36rem measure beside the footer links', () => {
    expect(ruleBody(noteCss, '.privacy-note')).toMatch(/max-width:\s*36rem;/)
  })

  it('says nothing is uploaded when signed out', () => {
    render(<PrivacyNote signedIn={false} keepFiles={false} removable />)
    expect(
      screen.getByText(
        'Nothing is uploaded; analysis runs in your browser. Summaries and detailed recordings are kept in this browser where it allows, so anyone using it can see them. Recordings fit in about 64 MiB, and those of the oldest activities are dropped first. Remove all my activities, on Profile, removes them.',
      ),
    ).toBeInTheDocument()
  })

  it('ignores keepFiles when signed out', () => {
    render(<PrivacyNote signedIn={false} keepFiles removable />)
    expect(
      screen.getByText(
        'Nothing is uploaded; analysis runs in your browser. Summaries and detailed recordings are kept in this browser where it allows, so anyone using it can see them. Recordings fit in about 64 MiB, and those of the oldest activities are dropped first. Remove all my activities, on Profile, removes them.',
      ),
    ).toBeInTheDocument()
  })

  it('names no control that is not there: with nothing kept to remove, the note stops at the recordings', () => {
    render(<PrivacyNote signedIn={false} keepFiles={false} removable={false} />)
    expect(
      screen.getByText(
        'Nothing is uploaded; analysis runs in your browser. Summaries and detailed recordings are kept in this browser where it allows, so anyone using it can see them. Recordings fit in about 64 MiB, and those of the oldest activities are dropped first.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Remove all my activities/)).toBeNull()
  })

  it('says summaries and original files are stored when signed in and keeping files', () => {
    render(<PrivacyNote signedIn keepFiles removable={false} />)
    expect(
      screen.getByText(
        'Your activity summaries and original files are stored in your private library. Analysis runs in your browser, which also keeps detailed recordings where it allows, for as many activities as fit in about 64 MiB, keeping the newest first.',
      ),
    ).toBeInTheDocument()
  })

  it('says original files are not kept when signed in without keeping files', () => {
    render(<PrivacyNote signedIn keepFiles={false} removable={false} />)
    expect(
      screen.getByText(
        'Your activity summaries are stored in your private library; original files are not kept. Analysis runs in your browser, which also keeps detailed recordings where it allows, for as many activities as fit in about 64 MiB, keeping the newest first.',
      ),
    ).toBeInTheDocument()
  })

  it('explains unavailable retention without implying existing originals were deleted', () => {
    render(<PrivacyNote signedIn keepFiles fileRetentionAvailable={false} removable={false} />)
    expect(
      screen.getByText(
        'Your activity summaries are stored in your private library. Original file storage is unavailable here, so new files are not kept; existing saved originals are not deleted. Analysis runs in your browser, which also keeps detailed recordings where it allows, for as many activities as fit in about 64 MiB, keeping the newest first.',
      ),
    ).toBeInTheDocument()
  })

  it('treats an omitted capability as available for older APIs', () => {
    render(<PrivacyNote signedIn keepFiles removable={false} />)
    expect(
      screen.getByText(
        'Your activity summaries and original files are stored in your private library. Analysis runs in your browser, which also keeps detailed recordings where it allows, for as many activities as fit in about 64 MiB, keeping the newest first.',
      ),
    ).toBeInTheDocument()
  })
})
