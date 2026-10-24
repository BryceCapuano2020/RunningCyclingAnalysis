// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AthleteSettings } from '@rca/core/types'
import { analysisStub } from '../../test/analysisStub'
import type { AnalysisStubOverrides } from '../../test/analysisStub'
import { makeResult } from '../components/fixtures'
import type { SavedActivity } from '../../worker/protocol'
import type { ProfilePageProps } from './ProfilePage'
import { ProfilePage } from './ProfilePage'

afterEach(() => {
  cleanup()
})

const SETTINGS: AthleteSettings = { massKg: 75, bikeMassKg: 9 }
const KEPT_RUN: SavedActivity = {
  id: 'run-1',
  name: 'Morning run',
  startMs: new Date(2026, 9, 20, 12).getTime(),
  sport: 'run',
}
const EMAIL = 'ada@example.com'

/** Renders the profile with a signed-out visitor by default, and returns the callbacks. */
function renderProfile(
  overrides: Partial<Omit<ProfilePageProps, 'analysis'>> = {},
  analysis: AnalysisStubOverrides = {},
) {
  const onSaveProfile = vi.fn(async () => undefined)
  const onStartOver = vi.fn()
  const onDownloadData = vi.fn(async () => new Blob())
  const onDeleteAccount = vi.fn(async () => {})
  render(
    <ProfilePage
      analysis={analysisStub(analysis)}
      settings={SETTINGS}
      units="metric"
      birthYear={1990}
      sex="female"
      signedIn={false}
      accountsAvailable
      email={null}
      keepFiles={false}
      fileRetentionAvailable
      onSaveProfile={onSaveProfile}
      onDownloadData={onDownloadData}
      onDeleteAccount={onDeleteAccount}
      onStartOver={onStartOver}
      {...overrides}
    />,
  )
  return { onSaveProfile, onStartOver, onDownloadData, onDeleteAccount }
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
    expect(within(section).getByLabelText('Bike and gear weight')).toHaveValue('9')
  })

  it('saves only the body weight that changed', () => {
    const { onSaveProfile } = renderProfile()

    const body = screen.getByLabelText('Body weight')
    fireEvent.change(body, { target: { value: '80' } })
    fireEvent.blur(body)

    expect(onSaveProfile).toHaveBeenCalledOnce()
    expect(onSaveProfile).toHaveBeenCalledWith({ settings: { massKg: 80 } })
  })

  it('says the weight was not saved when the account write is refused', async () => {
    renderProfile({ onSaveProfile: vi.fn(() => Promise.reject(new Error('offline'))) })

    const body = screen.getByLabelText('Body weight')
    fireEvent.change(body, { target: { value: '80' } })
    fireEvent.blur(body)

    expect(await screen.findByText("Couldn't save. Try again.")).toBeInTheDocument()
    expect(body).toHaveValue('80')
  })

  it('shows the year of birth and sex, and saves a year when it is left', () => {
    const { onSaveProfile } = renderProfile()
    const year = screen.getByLabelText('Year of birth')
    expect(year).toHaveValue('1990')
    expect(screen.getByRole('radio', { name: 'Female' })).toBeChecked()

    fireEvent.change(year, { target: { value: '1985' } })
    expect(onSaveProfile).not.toHaveBeenCalled()
    fireEvent.blur(year)
    expect(onSaveProfile).toHaveBeenCalledWith({ birthYear: 1985 })
  })

  it('saves a year on Enter as well', () => {
    const { onSaveProfile } = renderProfile()
    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1985' } })
    fireEvent.keyDown(year, { key: 'Enter' })
    expect(onSaveProfile).toHaveBeenCalledWith({ birthYear: 1985 })
  })

  it('rejects a year outside the plausible range, and saves nothing', () => {
    const { onSaveProfile } = renderProfile()
    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1800' } })
    fireEvent.blur(year)

    expect(screen.getByRole('alert')).toHaveTextContent(/^Enter a year from \d{4} to \d{4}$/)
    expect(year).toHaveAttribute('aria-invalid', 'true')
    expect(onSaveProfile).not.toHaveBeenCalled()
  })

  it('clears the year when the field is emptied, and saves a null year', () => {
    const { onSaveProfile } = renderProfile()
    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '' } })
    fireEvent.blur(year)
    expect(onSaveProfile).toHaveBeenCalledWith({ birthYear: null })
  })

  it('saves the sex chosen, and clears it with Prefer not to say', () => {
    const { onSaveProfile } = renderProfile({ sex: 'male' })
    expect(screen.getByRole('radio', { name: 'Male' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: 'Prefer not to say' }))
    expect(onSaveProfile).toHaveBeenLastCalledWith({ sex: null })

    fireEvent.click(screen.getByRole('radio', { name: 'Female' }))
    expect(onSaveProfile).toHaveBeenLastCalledWith({ sex: 'female' })
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

  it('shows the email, data download and deletion once signed in, in place of the sign-in text', () => {
    renderProfile({ signedIn: true, email: EMAIL })

    const section = screen.getByRole('region', { name: 'Account' })
    expect(within(section).getByText(EMAIL, { selector: '.account-section__email' })).toBeVisible()
    expect(within(section).getByRole('button', { name: 'Download my data' })).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Delete account…' })).toBeInTheDocument()
    expect(within(section).queryByText(/Sign in with Google/)).not.toBeInTheDocument()
  })

  it('asks for the email before deleting, and does not delete on opening the dialog', () => {
    const { onDeleteAccount } = renderProfile({ signedIn: true, email: EMAIL })

    fireEvent.click(screen.getByRole('button', { name: 'Delete account…' }))
    expect(screen.getByRole('dialog', { name: 'Delete your account?' })).toBeInTheDocument()
    expect(onDeleteAccount).not.toHaveBeenCalled()
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

  it('does not show the signed-in library to a signed-out visitor', () => {
    renderProfile({}, { libraryStatus: 'loaded', savedActivities: [KEPT_RUN] })
    expect(screen.queryByRole('heading', { name: 'Saved library' })).not.toBeInTheDocument()
  })

  it('shows the signed-in library under its own heading, with the account wording', () => {
    renderProfile({ signedIn: true }, { libraryStatus: 'loaded', savedActivities: [KEPT_RUN] })

    expect(screen.getByRole('heading', { name: 'Saved library' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Kept in this browser' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Delete Morning run, / }))
    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
      /permanently deletes the activity’s original file and saved summary/,
    )
  })
})

describe('ProfilePage kept in this browser', () => {
  it('lists the activities kept in this browser to a signed-out visitor, with a note', () => {
    renderProfile({}, { savedActivities: [KEPT_RUN] })

    expect(
      screen.getByRole('heading', { level: 2, name: 'Kept in this browser' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Anyone using this browser can see these. Start over removes them all.'),
    ).toBeInTheDocument()
    const section = screen.getByRole('region', { name: 'Kept in this browser' })
    expect(
      within(section).getByRole('button', { name: /^Delete Morning run, Run, / }),
    ).toBeVisible()
  })

  it('is not shown when no activities are kept in this browser', () => {
    renderProfile({}, { libraryStatus: 'loaded' })
    expect(screen.queryByRole('heading', { name: 'Kept in this browser' })).not.toBeInTheDocument()
  })

  it('words the delete confirmation for the summary kept in this browser', () => {
    renderProfile({}, { savedActivities: [KEPT_RUN] })

    fireEvent.click(screen.getByRole('button', { name: /^Delete Morning run, / }))

    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
      /permanently deletes the activity’s summary kept in this browser/,
    )
  })

  it('deletes the kept activity that was chosen', () => {
    const deleteActivity = vi.fn()
    renderProfile({}, { savedActivities: [KEPT_RUN], deleteActivity })

    fireEvent.click(screen.getByRole('button', { name: /^Delete Morning run, / }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))

    expect(deleteActivity).toHaveBeenCalledWith('run-1')
  })
})

describe('ProfilePage start over', () => {
  it('says that Start over removes the activities kept in this browser', () => {
    renderProfile({}, { state: { result: makeResult() } })
    expect(
      screen.getByText('Removes the activities kept in this browser so you can start again.'),
    ).toBeInTheDocument()
  })

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
      screen.getByText(
        'Nothing is uploaded. Files are analysed in your browser, and their summaries are kept in this browser where it allows, so anyone using this browser can see them. Start over removes them.',
      ),
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
