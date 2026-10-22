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
      screen.getByText('Nothing is uploaded. Files are read and analysed in your browser only.'),
    ).toBeInTheDocument()
  })

  it('ignores keepFiles when signed out', () => {
    render(<PrivacyNote signedIn={false} keepFiles />)
    expect(
      screen.getByText('Nothing is uploaded. Files are read and analysed in your browser only.'),
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
})
