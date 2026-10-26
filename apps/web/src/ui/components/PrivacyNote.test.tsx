// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PrivacyNote } from './PrivacyNote'

afterEach(() => {
  cleanup()
})

describe('PrivacyNote', () => {
  it('says nothing is uploaded when signed out', () => {
    render(<PrivacyNote signedIn={false} keepFiles={false} />)
    expect(
      screen.getByText(
        'Nothing is uploaded. Files are analysed in your browser, and their summaries are kept in this browser where it allows, so anyone using this browser can see them. Remove all my activities removes them.',
      ),
    ).toBeInTheDocument()
  })

  it('ignores keepFiles when signed out', () => {
    render(<PrivacyNote signedIn={false} keepFiles />)
    expect(
      screen.getByText(
        'Nothing is uploaded. Files are analysed in your browser, and their summaries are kept in this browser where it allows, so anyone using this browser can see them. Remove all my activities removes them.',
      ),
    ).toBeInTheDocument()
  })

  it('says summaries and original files are stored when signed in and keeping files', () => {
    render(<PrivacyNote signedIn keepFiles />)
    expect(
      screen.getByText(
        'Your activity summaries and original files are stored in your private library. Analysis runs in your browser.',
      ),
    ).toBeInTheDocument()
  })

  it('says original files stay on this device when signed in without keeping files', () => {
    render(<PrivacyNote signedIn keepFiles={false} />)
    expect(
      screen.getByText(
        'Your activity summaries are stored in your private library; original files stay on this device. Analysis runs in your browser.',
      ),
    ).toBeInTheDocument()
  })

  it('explains unavailable retention without implying existing originals were deleted', () => {
    render(<PrivacyNote signedIn keepFiles fileRetentionAvailable={false} />)
    expect(
      screen.getByText(
        'Your activity summaries are stored in your private library. Original file storage is unavailable here, so new files stay on this device; existing saved originals are not deleted. Analysis runs in your browser.',
      ),
    ).toBeInTheDocument()
  })

  it('treats an omitted capability as available for older APIs', () => {
    render(<PrivacyNote signedIn keepFiles />)
    expect(
      screen.getByText(
        'Your activity summaries and original files are stored in your private library. Analysis runs in your browser.',
      ),
    ).toBeInTheDocument()
  })
})
