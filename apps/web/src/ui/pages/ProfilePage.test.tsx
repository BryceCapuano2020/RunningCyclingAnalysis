// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AthleteSettings } from '@rca/core/types'
import { analysisStub } from '../../test/analysisStub'
import type { AnalysisStubOverrides } from '../../test/analysisStub'
import { makeResult } from '../components/fixtures'
import type { ProfilePageProps } from './ProfilePage'
import { ProfilePage } from './ProfilePage'

afterEach(() => {
  cleanup()
})

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }

/** Renders the profile with a signed-out visitor by default, and returns the two callbacks. */
function renderProfile(
  overrides: Partial<Omit<ProfilePageProps, 'analysis'>> = {},
  analysis: AnalysisStubOverrides = {},
) {
  const onSaveProfile = vi.fn()
  const onStartOver = vi.fn()
  render(
    <ProfilePage
      analysis={analysisStub(analysis)}
      settings={SETTINGS}
      units="metric"
      signedIn={false}
      accountsAvailable
      keepFiles={false}
      fileRetentionAvailable
      onSaveProfile={onSaveProfile}
      onStartOver={onStartOver}
      {...overrides}
    />,
  )
  return { onSaveProfile, onStartOver }
}

describe('ProfilePage settings', () => {
  it('is the page heading, focusable', () => {
    renderProfile()
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toHaveAttribute(
      'id',
      'page-heading',
    )
  })

  it('shows the body and bike weights from the settings', () => {
    renderProfile()

    const section = screen.getByRole('region', { name: 'You and your bike' })
    expect(within(section).getByLabelText('Body weight')).toHaveValue('75')
    expect(within(section).getByLabelText('Bike and kit weight')).toHaveValue('9')
  })

  it('saves a changed body weight with the bike weight kept', () => {
    const { onSaveProfile } = renderProfile()

    const body = screen.getByLabelText('Body weight')
    fireEvent.change(body, { target: { value: '80' } })
    fireEvent.blur(body)

    expect(onSaveProfile).toHaveBeenCalledOnce()
    expect(onSaveProfile).toHaveBeenCalledWith({ settings: { massKg: 80, bikeMassKg: 9 } })
  })

  it('marks the unit system in use and offers both as one radio group', () => {
    renderProfile({ units: 'metric' })

    const units = screen.getByRole('group', { name: 'Units' })
    expect(within(units).getByRole('radio', { name: 'Metric' })).toBeChecked()
    expect(within(units).getByRole('radio', { name: 'Imperial' })).not.toBeChecked()
  })

  it('saves the chosen unit system as the only change', () => {
    const { onSaveProfile } = renderProfile({ units: 'imperial' })

    fireEvent.click(screen.getByRole('radio', { name: 'Metric' }))

    expect(onSaveProfile).toHaveBeenCalledOnce()
    expect(onSaveProfile).toHaveBeenCalledWith({ units: 'metric' })
  })
})

describe('ProfilePage account', () => {
  it('explains the account in text to a signed-out visitor, with sign-in only in the header', () => {
    renderProfile()

    const section = screen.getByRole('region', { name: 'Account' })
    expect(within(section).getByText(/Sign in with Google, at the top of the page/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument()
  })

  it('leaves the account section out when accounts are not available on this deployment', () => {
    renderProfile({ accountsAvailable: false })

    expect(screen.queryByRole('region', { name: 'Account' })).not.toBeInTheDocument()
  })

  it('leaves the account section out once the visitor is signed in', () => {
    renderProfile({ signedIn: true })

    expect(screen.queryByRole('region', { name: 'Account' })).not.toBeInTheDocument()
  })
})

describe('ProfilePage original files', () => {
  it('offers the keep-files choice only to a signed-in user', () => {
    renderProfile()
    expect(screen.queryByRole('heading', { name: 'Original files' })).not.toBeInTheDocument()
    cleanup()

    renderProfile({ signedIn: true, keepFiles: true })
    expect(screen.getByRole('heading', { name: 'Original files' })).toBeInTheDocument()
    expect(
      screen.getByRole('checkbox', { name: 'Keep original files in my library' }),
    ).toBeChecked()
  })

  it('saves a change to keeping original files as its own field', () => {
    const { onSaveProfile } = renderProfile({ signedIn: true, keepFiles: false })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep original files in my library' }))

    expect(onSaveProfile).toHaveBeenCalledOnce()
    expect(onSaveProfile).toHaveBeenCalledWith({ keepFiles: true })
  })

  it('disables the choice and says why when original file storage is unavailable', () => {
    renderProfile({ signedIn: true, fileRetentionAvailable: false })

    expect(
      screen.getByRole('checkbox', { name: 'Keep original files in my library' }),
    ).toBeDisabled()
    expect(
      screen.getByText(/Original file storage is unavailable on this deployment/),
    ).toBeInTheDocument()
  })
})

describe('ProfilePage saved library', () => {
  it('shows the saved library once the signed-in library has loaded', () => {
    renderProfile({ signedIn: true }, { libraryStatus: 'loaded' })

    const section = screen.getByRole('region', { name: 'Saved library' })
    expect(within(section).getByText('No saved activities')).toBeInTheDocument()
  })

  it('does not show it while the library is still loading', () => {
    renderProfile({ signedIn: true }, { libraryStatus: 'loading' })
    expect(screen.queryByRole('region', { name: 'Saved library' })).not.toBeInTheDocument()
  })

  it('does not show it to a signed-out visitor', () => {
    renderProfile({}, { libraryStatus: 'loaded' })
    expect(screen.queryByRole('region', { name: 'Saved library' })).not.toBeInTheDocument()
  })
})

describe('ProfilePage start over', () => {
  it('hands over to the app when a signed-out visitor with a result starts over', () => {
    const { onStartOver } = renderProfile({}, { state: { result: makeResult() } })

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }))

    expect(onStartOver).toHaveBeenCalledOnce()
  })

  it('does not offer it without a result to clear', () => {
    renderProfile()
    expect(screen.queryByRole('button', { name: 'Start over' })).not.toBeInTheDocument()
  })

  it('does not offer it to a signed-in user, whose activities live in the library', () => {
    renderProfile({ signedIn: true }, { state: { result: makeResult() } })
    expect(screen.queryByRole('button', { name: 'Start over' })).not.toBeInTheDocument()
  })

  it('holds the button while an analysis is busy', () => {
    renderProfile({}, { busy: true, state: { result: makeResult() } })
    expect(screen.getByRole('button', { name: 'Start over' })).toBeDisabled()
  })
})

describe('ProfilePage privacy note', () => {
  it('says nothing is uploaded to a signed-out visitor', () => {
    renderProfile()
    expect(
      screen.getByText('Nothing is uploaded. Files are read and analysed in your browser only.'),
    ).toBeInTheDocument()
  })

  it('says originals are stored in the private library once the signed-in user keeps them', () => {
    renderProfile({ signedIn: true, keepFiles: true })
    expect(
      screen.getByText(
        'Your activity summaries and original files are stored in your private library. Analysis runs in your browser.',
      ),
    ).toBeInTheDocument()
  })
})
