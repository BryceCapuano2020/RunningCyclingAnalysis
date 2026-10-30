// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Measurement } from '@rca/core/athlete'
import type { AthleteSettings } from '@rca/core/types'
import { analysisStub } from '../../test/analysisStub'
import type { AnalysisStubOverrides } from '../../test/analysisStub'
import { estimatesFrom, makeResult } from '../components/fixtures'
import type { SavedActivity } from '../../worker/protocol'
import type { ProfilePageProps } from './ProfilePage'
import type { ProfilePatch } from '../profilePatch'
import { hrefFor } from '../route'
import { SAMPLE_PROFILE } from '../sampleAthlete'
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
  copy: { id: 'run-1', rank: 3, hasPower: false, hasHeartRate: true, durationS: 3600 },
}
const EMAIL = 'ada@example.com'

/** Renders the profile with a signed-out visitor by default, and returns the callbacks. */
function renderProfile(
  overrides: Partial<Omit<ProfilePageProps, 'analysis'>> = {},
  analysis: AnalysisStubOverrides = {},
) {
  const onSaveProfile = vi.fn(async () => {})
  const onRemoveAll = vi.fn()
  const onSignIn = vi.fn()
  const onDownloadData = vi.fn(async () => new Blob())
  const onDeleteAccount = vi.fn(async () => {})
  const analysisProp = analysisStub(analysis)
  const element = (changed: Partial<Omit<ProfilePageProps, 'analysis'>>) => (
    <ProfilePage
      analysis={analysisProp}
      settings={SETTINGS}
      athlete={SETTINGS}
      units="metric"
      birthYear={1990}
      sex="female"
      signedIn={false}
      accountsAvailable
      accountLoading={false}
      email={null}
      keepFiles={false}
      fileRetentionAvailable
      onSaveProfile={onSaveProfile}
      dated={{ entries: [], state: 'ready', elsewhere: 0, retry: vi.fn() }}
      onAddSetting={async () => {}}
      onRemoveSetting={async () => {}}
      onSignIn={onSignIn}
      onDownloadData={onDownloadData}
      onDeleteAccount={onDeleteAccount}
      onRemoveAll={onRemoveAll}
      {...overrides}
      {...changed}
    />
  )
  const view = render(element({}))
  /** Renders again with these props changed, as the page does when its settings finish loading. */
  const rerenderWith = (changed: Partial<Omit<ProfilePageProps, 'analysis'>>) =>
    view.rerender(element(changed))
  return { onSaveProfile, onRemoveAll, onSignIn, onDownloadData, onDeleteAccount, rerenderWith }
}

describe('ProfilePage settings', () => {
  it('is the page heading, focusable', () => {
    renderProfile()
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toHaveAttribute(
      'id',
      'page-heading',
    )
  })

  it('groups the year and sex as about you, and the weights and units as body and bike', () => {
    renderProfile()

    const about = screen.getByRole('region', { name: 'About you' })
    expect(within(about).getByLabelText('Year of birth')).toBeInTheDocument()
    expect(within(about).getByRole('radio', { name: 'Woman' })).toBeChecked()

    const body = screen.getByRole('region', { name: 'Body and bike' })
    expect(within(body).getByLabelText('Body weight')).toHaveValue('75')
    expect(within(body).getByLabelText('Bike and gear weight')).toHaveValue('9')
    expect(within(body).getByRole('group', { name: 'Units' })).toBeInTheDocument()
  })

  it('puts the units before the weights in body and bike, since they say what the weights are in', () => {
    renderProfile()
    const body = screen.getByRole('region', { name: 'Body and bike' })
    const units = within(body).getByRole('group', { name: 'Units' })
    const weight = within(body).getByLabelText('Body weight')
    expect(units.compareDocumentPosition(weight) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sets About you and Body and bike side by side in one pair, which a narrow screen stacks', () => {
    renderProfile()
    const about = screen.getByRole('region', { name: 'About you' })
    const body = screen.getByRole('region', { name: 'Body and bike' })
    expect(about.parentElement).toBe(body.parentElement)
    expect(about.parentElement).toHaveClass('profile-pair')
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
    expect(screen.getByRole('radio', { name: 'Woman' })).toBeChecked()

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

  it('keeps a typed year, with its own status saying the save failed', async () => {
    const onSaveProfile = vi.fn(async () => {
      throw new Error('Offline')
    })
    renderProfile({ onSaveProfile })
    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1985' } })
    fireEvent.blur(year)

    expect(await screen.findByText("Year of birth: Couldn't save. Try again.")).toBeInTheDocument()
    expect(year).toHaveValue('1985')
  })

  it('shows Saving, then Saved, for a year that is left', async () => {
    let finish: () => void = () => undefined
    const onSaveProfile = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    renderProfile({ onSaveProfile })
    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1985' } })
    fireEvent.blur(year)

    expect(screen.getByText('Year of birth: Saving…')).toBeInTheDocument()
    finish()
    expect(await screen.findByText('Year of birth: Saved.')).toBeInTheDocument()
  })

  it('sends one save when Enter and then leaving the field both commit the same year', () => {
    const onSaveProfile = vi.fn(() => new Promise<void>(() => undefined))
    renderProfile({ onSaveProfile })
    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1985' } })
    fireEvent.keyDown(year, { key: 'Enter' })
    fireEvent.blur(year)

    expect(onSaveProfile).toHaveBeenCalledOnce()
    expect(onSaveProfile).toHaveBeenCalledWith({ birthYear: 1985 })
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
    expect(screen.getByRole('radio', { name: 'Man' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: 'Prefer not to say' }))
    expect(onSaveProfile).toHaveBeenLastCalledWith({ sex: null })

    fireEvent.click(screen.getByRole('radio', { name: 'Woman' }))
    expect(onSaveProfile).toHaveBeenLastCalledWith({ sex: 'female' })
  })

  it('shows the chosen sex at once while it saves, then reports it saved', async () => {
    let finish: () => void = () => undefined
    const onSaveProfile = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    renderProfile({ sex: 'female', onSaveProfile })

    fireEvent.click(screen.getByRole('radio', { name: 'Man' }))
    expect(screen.getByRole('radio', { name: 'Man' })).toBeChecked()
    expect(screen.getByText('Sex: Saving…')).toBeInTheDocument()

    finish()
    expect(await screen.findByText('Sex: Saved.')).toBeInTheDocument()
  })

  it('returns the sex to the saved value and says so when the save is refused', async () => {
    const onSaveProfile = vi.fn(async () => {
      throw new Error('Offline')
    })
    renderProfile({ sex: 'female', onSaveProfile })

    fireEvent.click(screen.getByRole('radio', { name: 'Man' }))

    expect(await screen.findByText("Sex: Couldn't save. Try again.")).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Woman' })).toBeChecked()
  })

  it('shows Saving, then Saved, for a unit system chosen', async () => {
    let finish: () => void = () => undefined
    const onSaveProfile = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    renderProfile({ units: 'metric', onSaveProfile })

    fireEvent.click(screen.getByRole('radio', { name: 'Imperial' }))
    expect(screen.getByText('Units: Saving…')).toBeInTheDocument()

    finish()
    expect(await screen.findByText('Units: Saved.')).toBeInTheDocument()
  })

  it('shows the unit system at once and reports a refused change to it', async () => {
    const onSaveProfile = vi.fn(async () => {
      throw new Error('Offline')
    })
    renderProfile({ units: 'metric', onSaveProfile })

    fireEvent.click(screen.getByRole('radio', { name: 'Imperial' }))
    expect(screen.getByRole('radio', { name: 'Imperial' })).toBeChecked()

    expect(await screen.findByText("Units: Couldn't save. Try again.")).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Metric' })).toBeChecked()
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

  it('holds the athlete fields while the account is still loading', () => {
    renderProfile({ accountLoading: true })

    expect(screen.getByLabelText('Year of birth').closest('[inert]')).not.toBeNull()
    expect(screen.getByLabelText('Body weight').closest('[inert]')).not.toBeNull()
    expect(screen.getByRole('radio', { name: 'Metric' }).closest('[inert]')).not.toBeNull()
  })

  it('says the account is loading in a status outside the held fields, so it is announced', () => {
    renderProfile({ accountLoading: true })

    const waiting = screen.getByText('Waiting for your account…')
    expect(waiting).toHaveAttribute('role', 'status')
    expect(waiting.closest('[inert]')).toBeNull()
  })

  it('leaves the fields open, with no waiting note, once the account is known', () => {
    renderProfile({ accountLoading: false })

    expect(screen.getByLabelText('Year of birth').closest('[inert]')).toBeNull()
    expect(screen.queryByText('Waiting for your account…')).not.toBeInTheDocument()
  })
})

describe('ProfilePage account', () => {
  it('offers a sign-in button in the account section to a signed-out visitor', () => {
    const { onSignIn } = renderProfile()

    const section = screen.getByRole('region', { name: 'Account' })
    expect(section).toHaveTextContent('Sign in to keep your library on any device')
    fireEvent.click(within(section).getByRole('button', { name: 'Sign in with Google' }))
    expect(onSignIn).toHaveBeenCalledOnce()
  })

  it('leaves the account section out when accounts are not available on this deployment', () => {
    renderProfile({ accountsAvailable: false })

    expect(screen.queryByRole('region', { name: 'Account' })).not.toBeInTheDocument()
  })

  it('offers no sign-in while the account is loading', () => {
    renderProfile({ accountLoading: true })

    expect(screen.queryByRole('region', { name: 'Account' })).not.toBeInTheDocument()
  })

  it('shows the email, data download and deletion once signed in, in place of the sign-in text', () => {
    renderProfile({ signedIn: true, email: EMAIL })

    const section = screen.getByRole('region', { name: 'Account' })
    expect(within(section).getByText(EMAIL, { selector: '.account-section__email' })).toBeVisible()
    expect(within(section).getByRole('button', { name: 'Download my data' })).toBeInTheDocument()
    expect(within(section).getByRole('button', { name: 'Delete account…' })).toBeInTheDocument()
    expect(within(section).queryByText(/Sign in to keep/)).not.toBeInTheDocument()
  })

  it('asks for the email before deleting, and does not delete on opening the dialog', () => {
    const { onDeleteAccount } = renderProfile({ signedIn: true, email: EMAIL })

    fireEvent.click(screen.getByRole('button', { name: 'Delete account…' }))
    expect(screen.getByRole('alertdialog', { name: 'Delete your account?' })).toBeInTheDocument()
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

  it('names the stored originals a turn-off deletes, from the library it has loaded', () => {
    renderProfile(
      { signedIn: true, keepFiles: true },
      {
        libraryStatus: 'loaded',
        savedActivities: [KEPT_RUN, { ...KEPT_RUN, id: 'run-2' }, { ...KEPT_RUN, id: 'run-3' }],
        missingOriginals: 1,
      },
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep original files in my library' }))

    expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
      /This deletes 2 stored original files\./,
    )
  })

  it('disables the choice and says why when original file storage is unavailable', () => {
    renderProfile({ signedIn: true, fileRetentionAvailable: false })

    expect(
      screen.getByRole('checkbox', { name: 'Keep original files in my library' }),
    ).toBeDisabled()
    expect(screen.getByText(/Original file storage is unavailable right now/)).toBeInTheDocument()
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

  it('counts the signed-in library under its own heading and points to Activities, with no list', () => {
    renderProfile({ signedIn: true }, { libraryStatus: 'loaded', savedActivities: [KEPT_RUN] })

    const section = screen.getByRole('region', { name: 'Saved library' })
    expect(within(section).getByText('1 run, Oct 2026')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Kept in this browser' })).not.toBeInTheDocument()
    expect(within(section).getByRole('link', { name: 'See them in Activities' })).toHaveAttribute(
      'href',
      '#/activities',
    )
    expect(within(section).queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument()
    expect(within(section).queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('ProfilePage kept in this browser', () => {
  it('counts the activities kept in this browser, with a note and a link to Activities', () => {
    renderProfile({}, { savedActivities: [KEPT_RUN] })

    expect(
      screen.getByRole('heading', { level: 2, name: 'Kept in this browser' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Anyone using this browser can see these.')).toBeInTheDocument()
    const section = screen.getByRole('region', { name: 'Kept in this browser' })
    expect(within(section).getByText('1 run, Oct 2026')).toBeInTheDocument()
    expect(within(section).getByRole('link', { name: 'See them in Activities' })).toHaveAttribute(
      'href',
      '#/activities',
    )
  })

  it('gives a long library as one line, not as a table with a delete on each row', () => {
    const many = Array.from({ length: 98 * 20 }, (_, index) => ({
      ...KEPT_RUN,
      id: `run-${index}`,
      sport: index % 7 === 0 ? ('ride' as const) : ('run' as const),
      startMs: new Date(2011 + Math.floor(index / 140), index % 12, 3, 12).getTime() + index,
    }))
    renderProfile({}, { savedActivities: many })

    const section = screen.getByRole('region', { name: 'Kept in this browser' })
    expect(
      within(section).getByText('1,680 runs and 280 rides, from Jan 2011 to Dec 2024'),
    ).toBeInTheDocument()
    expect(within(section).queryAllByRole('button')).toHaveLength(0)
    expect(
      screen.queryByRole('navigation', { name: /saved activity pages/i }),
    ).not.toBeInTheDocument()
  })

  it('says where an activity is deleted, which is its row or its own page', () => {
    renderProfile({}, { savedActivities: [KEPT_RUN] })
    expect(screen.getByText(/delete it from its row or its own page/)).toBeInTheDocument()
  })

  it('names stored activities that could not be read, and shows the section for them alone', () => {
    renderProfile({}, { savedActivities: [], libraryUnreadable: 2 })
    const section = screen.getByRole('region', { name: 'Kept in this browser' })
    expect(section).toHaveTextContent(
      '2 saved activities could not be read and are hidden. Re-adding their files will restore them.',
    )
  })

  it('is not shown when no activities are kept in this browser', () => {
    renderProfile({}, { libraryStatus: 'loaded' })
    expect(screen.queryByRole('heading', { name: 'Kept in this browser' })).not.toBeInTheDocument()
  })
})

describe('ProfilePage remove activities', () => {
  it('styles the trigger as the destructive control it is, so it is not mistaken for a plain button', () => {
    renderProfile({}, { savedActivities: [KEPT_RUN] })
    expect(screen.getByRole('button', { name: 'Remove all my activities' })).toHaveClass(
      'profile-remove',
    )
  })

  it('says that removing them clears this browser, and never claims the account is touched', () => {
    renderProfile({}, { state: { result: makeResult() }, savedActivities: [KEPT_RUN] })

    const section = screen.getByRole('region', { name: 'Remove activities' })
    expect(section).toHaveTextContent(
      'Removes every activity and detailed recording kept in this browser, and the analysis on screen.',
    )
    expect(section).not.toHaveTextContent(/account/i)
  })

  it('asks before removing, naming how many activities it removes', () => {
    const { onRemoveAll } = renderProfile(
      {},
      {
        state: { result: makeResult() },
        savedActivities: [KEPT_RUN, { ...KEPT_RUN, id: 'run-2' }],
      },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove all my activities' }))

    const dialog = screen.getByRole('alertdialog', {
      name: 'Remove all 2 activities kept in this browser?',
    })
    expect(dialog).toHaveAccessibleDescription(/cannot be undone/)
    expect(onRemoveAll).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('removes them once the removal is confirmed', () => {
    const { onRemoveAll } = renderProfile(
      {},
      { state: { result: makeResult() }, savedActivities: [KEPT_RUN] },
    )

    fireEvent.click(screen.getByRole('button', { name: 'Remove all my activities' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }))

    expect(onRemoveAll).toHaveBeenCalledOnce()
  })

  it('does nothing when the removal is cancelled', () => {
    const { onRemoveAll } = renderProfile(
      {},
      { state: { result: makeResult() }, savedActivities: [KEPT_RUN] },
    )

    const trigger = screen.getByRole('button', { name: 'Remove all my activities' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onRemoveAll).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('names only the analysis on screen when nothing is kept in this browser', () => {
    renderProfile({}, { state: { result: makeResult() } })

    fireEvent.click(screen.getByRole('button', { name: 'Clear the analysis' }))

    expect(
      screen.getByRole('alertdialog', { name: 'Clear the analysis on this page?' }),
    ).toHaveAccessibleDescription(/No activities or detailed recordings are kept in this browser/)
  })

  it('names a single kept activity in the singular', () => {
    renderProfile({}, { state: { result: makeResult() }, savedActivities: [KEPT_RUN] })

    fireEvent.click(screen.getByRole('button', { name: 'Remove all my activities' }))

    expect(
      screen.getByRole('alertdialog', { name: 'Remove all 1 activity kept in this browser?' }),
    ).toHaveAccessibleDescription(/cannot be undone/)
  })

  it('offers the removal to a signed-out visitor whose kept activities are not on screen', () => {
    renderProfile({}, { savedActivities: [KEPT_RUN] })

    expect(screen.getByRole('button', { name: 'Remove all my activities' })).toBeEnabled()
  })

  it('removes the kept activities on confirming, with no result on screen', () => {
    const { onRemoveAll } = renderProfile({}, { savedActivities: [KEPT_RUN] })

    fireEvent.click(screen.getByRole('button', { name: 'Remove all my activities' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }))

    expect(onRemoveAll).toHaveBeenCalledOnce()
  })

  it('says only the summaries go when there is no analysis on screen to clear', () => {
    renderProfile({}, { savedActivities: [KEPT_RUN] })

    fireEvent.click(screen.getByRole('button', { name: 'Remove all my activities' }))

    const dialog = screen.getByRole('alertdialog', {
      name: 'Remove all 1 activity kept in this browser?',
    })
    expect(dialog).toHaveAccessibleDescription(
      /Their summaries and detailed recordings are removed from this browser\./,
    )
    expect(dialog).not.toHaveAccessibleDescription(/analysis on screen/)
  })

  it('does not offer it without a result to clear', () => {
    renderProfile()
    expect(
      screen.queryByRole('button', { name: 'Remove all my activities' }),
    ).not.toBeInTheDocument()
  })

  it('does not offer it to a signed-in user, whose activities live in the library', () => {
    renderProfile({ signedIn: true }, { state: { result: makeResult() } })
    expect(
      screen.queryByRole('button', { name: 'Remove all my activities' }),
    ).not.toBeInTheDocument()
  })

  it('holds the button while an analysis is busy, and says when it will be available', () => {
    renderProfile({}, { busy: true, state: { result: makeResult() } })

    expect(screen.getByRole('button', { name: 'Clear the analysis' })).toBeDisabled()
    expect(screen.getByText('Available when the current analysis finishes.')).toBeInTheDocument()
  })
})

describe('ProfilePage questions follow their sections', () => {
  /** The page as a visitor sees it, with the props a test changes. */
  function page(
    overrides: Partial<Omit<ProfilePageProps, 'analysis'>>,
    analysis: AnalysisStubOverrides = {},
  ): ReactElement {
    return (
      <ProfilePage
        analysis={analysisStub(analysis)}
        settings={SETTINGS}
        athlete={SETTINGS}
        units="metric"
        birthYear={1990}
        sex="female"
        signedIn={false}
        accountsAvailable
        accountLoading={false}
        email={null}
        keepFiles={false}
        fileRetentionAvailable
        onSaveProfile={vi.fn(async () => {})}
        dated={{ entries: [], state: 'ready', elsewhere: 0, retry: vi.fn() }}
        onAddSetting={async () => {}}
        onRemoveSetting={async () => {}}
        onSignIn={vi.fn()}
        onDownloadData={vi.fn(async () => new Blob())}
        onDeleteAccount={vi.fn(async () => {})}
        onRemoveAll={vi.fn()}
        {...overrides}
      />
    )
  }

  const SIGNED_IN = { signedIn: true, email: EMAIL, keepFiles: true }
  const SIGNED_OUT = { signedIn: false, email: null, keepFiles: false }

  it('does not reopen the turn-off question by itself when the signed-in section comes back', () => {
    const view = render(page(SIGNED_IN))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep original files in my library' }))
    expect(
      screen.getByRole('alertdialog', { name: 'Turn off keeping original files?' }),
    ).toBeInTheDocument()

    view.rerender(page(SIGNED_OUT))
    view.rerender(page(SIGNED_IN))

    expect(
      screen.queryByRole('alertdialog', { name: 'Turn off keeping original files?' }),
    ).not.toBeInTheDocument()
  })

  it('does not reopen the account deletion dialog by itself after a sign-out and sign-in', () => {
    const view = render(page(SIGNED_IN))
    fireEvent.click(screen.getByRole('button', { name: 'Delete account…' }))
    expect(screen.getByRole('alertdialog', { name: 'Delete your account?' })).toBeInTheDocument()

    view.rerender(page(SIGNED_OUT))
    view.rerender(page(SIGNED_IN))

    expect(
      screen.queryByRole('alertdialog', { name: 'Delete your account?' }),
    ).not.toBeInTheDocument()
  })

  it('does not reopen the removal question by itself when the visitor signs in and out again', () => {
    const view = render(page({ ...SIGNED_OUT, keepFiles: false }, { savedActivities: [KEPT_RUN] }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove all my activities' }))
    expect(
      screen.getByRole('alertdialog', { name: 'Remove all 1 activity kept in this browser?' }),
    ).toBeInTheDocument()

    view.rerender(page(SIGNED_IN, { savedActivities: [KEPT_RUN] }))
    view.rerender(page(SIGNED_OUT, { savedActivities: [KEPT_RUN] }))

    expect(
      screen.queryByRole('alertdialog', { name: 'Remove all 1 activity kept in this browser?' }),
    ).not.toBeInTheDocument()
  })
})

describe('ProfilePage nothing kept', () => {
  it('reads Clear the analysis on the trigger, and says what it clears, when nothing is kept', () => {
    renderProfile({}, { state: { result: makeResult() } })

    expect(screen.getByRole('button', { name: 'Clear the analysis' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Remove all my activities' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Clears the analysis on screen. No activities or detailed recordings are kept in this browser.',
      ),
    ).toBeInTheDocument()
  })

  it('keeps Remove all my activities on the trigger once an activity is kept', () => {
    renderProfile({}, { state: { result: makeResult() }, savedActivities: [KEPT_RUN] })
    expect(screen.getByRole('button', { name: 'Remove all my activities' })).toBeInTheDocument()
  })
})

describe('ProfilePage a refused save', () => {
  /** A save that refuses the year and accepts everything else. */
  function refuseYear() {
    return vi.fn(async (next: ProfilePatch) => {
      if ('birthYear' in next) throw new Error('Offline')
    })
  }

  function refusedYear() {
    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1985' } })
    fireEvent.blur(year)
    return screen.findByText("Year of birth: Couldn't save. Try again.")
  }

  it('keeps a refused year in view when a later sex save succeeds', async () => {
    renderProfile({ onSaveProfile: refuseYear() })
    await refusedYear()

    fireEvent.click(screen.getByRole('radio', { name: 'Man' }))
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)))

    expect(screen.getByText("Year of birth: Couldn't save. Try again.")).toBeInTheDocument()
    expect(screen.queryByText('Sex: Saved.')).not.toBeInTheDocument()
  })

  it('lets go of a refused year when the year is edited again', async () => {
    renderProfile({ onSaveProfile: refuseYear() })
    await refusedYear()

    fireEvent.change(screen.getByLabelText('Year of birth'), { target: { value: '1986' } })

    expect(screen.queryByText("Year of birth: Couldn't save. Try again.")).not.toBeInTheDocument()
  })
})

describe('ProfilePage one status line', () => {
  it('keeps the status line in its own wrapper with the pair, so it adds a line, not a page gap', () => {
    renderProfile()
    const pair = document.querySelector('.profile-pair')
    expect(pair?.parentElement).not.toHaveClass('page-stack')
    expect(pair?.parentElement?.querySelector('.profile-save')).not.toBeNull()
  })

  it('shows every save in one status line under the two sections, so no save moves the fields', async () => {
    renderProfile()
    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1985' } })
    fireEvent.blur(year)

    const status = await screen.findByText('Year of birth: Saved.')
    expect(status.closest('.profile-pair')).toBeNull()
    expect(document.querySelectorAll('.profile-save')).toHaveLength(1)
    expect(document.querySelector('.profile-pair')?.nextElementSibling).toBe(status)
  })

  it('holds the account wait in the same line, outside the held fields', () => {
    renderProfile({ accountLoading: true })
    const waiting = screen.getByText('Waiting for your account…')
    expect(waiting.closest('.profile-pair')).toBeNull()
    expect(document.querySelectorAll('.profile-save')).toHaveLength(1)
  })
})

describe('ProfilePage privacy', () => {
  it('does not repeat the privacy note, which the page footer carries', () => {
    renderProfile()
    expect(screen.queryByText(/Nothing is uploaded/)).not.toBeInTheDocument()
  })

  it('does not repeat that analysis runs in the browser in the account section', () => {
    renderProfile()
    const section = screen.getByRole('region', { name: 'Account' })
    expect(section).toHaveTextContent('Sign in to keep your library on any device')
    expect(section).not.toHaveTextContent('Analysis still runs in your browser')
  })
})

describe('Profile guides', () => {
  it('offers the export guides, so a visitor can find the files to add', () => {
    renderProfile()
    expect(screen.getByRole('button', { name: 'How to get your files' })).toBeInTheDocument()
  })
})

describe('ProfilePage see your levels', () => {
  const LEVELS = { name: 'See your levels' }

  it('offers See your levels after a save, once year of birth and sex are known and a result is on screen', async () => {
    renderProfile({}, { state: { result: makeResult() } })
    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1985' } })
    fireEvent.blur(year)

    expect(await screen.findByText('Year of birth: Saved.')).toBeInTheDocument()
    expect(screen.getByRole('link', LEVELS)).toHaveAttribute('href', hrefFor({ page: 'balance' }))
  })

  it('offers it after a sex is saved, too', async () => {
    renderProfile({ sex: 'male' }, { state: { result: makeResult() } })
    fireEvent.click(screen.getByRole('radio', { name: 'Woman' }))

    expect(await screen.findByText('Sex: Saved.')).toBeInTheDocument()
    expect(screen.getByRole('link', LEVELS)).toBeInTheDocument()
  })

  it('offers it after a body weight is saved, beside its own saved sentence', async () => {
    renderProfile({}, { state: { result: makeResult() } })
    const body = screen.getByLabelText('Body weight')
    fireEvent.change(body, { target: { value: '76' } })
    fireEvent.blur(body)

    expect(
      await screen.findByText('Saved. Balance and ride results now use this.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', LEVELS)).toBeInTheDocument()
  })

  it('does not offer it while year of birth is still missing', async () => {
    renderProfile({ birthYear: null }, { state: { result: makeResult() } })
    fireEvent.click(screen.getByRole('radio', { name: 'Man' }))

    expect(await screen.findByText('Sex: Saved.')).toBeInTheDocument()
    expect(screen.queryByRole('link', LEVELS)).not.toBeInTheDocument()
  })

  it('does not offer it while sex is still unknown', async () => {
    renderProfile({ sex: null }, { state: { result: makeResult() } })
    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1985' } })
    fireEvent.blur(year)

    expect(await screen.findByText('Year of birth: Saved.')).toBeInTheDocument()
    expect(screen.queryByRole('link', LEVELS)).not.toBeInTheDocument()
  })

  it('does not offer it with no result on screen', async () => {
    renderProfile({})
    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1985' } })
    fireEvent.blur(year)

    expect(await screen.findByText('Year of birth: Saved.')).toBeInTheDocument()
    expect(screen.queryByRole('link', LEVELS)).not.toBeInTheDocument()
  })

  it('shows one link at a time, on the save made last', async () => {
    renderProfile({}, { state: { result: makeResult() } })
    const body = screen.getByLabelText('Body weight')
    fireEvent.change(body, { target: { value: '76' } })
    fireEvent.blur(body)
    expect(
      await screen.findByText('Saved. Balance and ride results now use this.'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', LEVELS)).toHaveLength(1)

    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1985' } })
    fireEvent.blur(year)
    expect(await screen.findByText('Year of birth: Saved.')).toBeInTheDocument()
    expect(screen.getAllByRole('link', LEVELS)).toHaveLength(1)
  })
})

describe('ProfilePage see your levels, save by save', () => {
  const LEVELS = { name: 'See your levels' }
  const SAVING_YEAR = (patch: ProfilePatch) =>
    'birthYear' in patch ? new Promise<void>(() => undefined) : Promise.resolve()

  it('offers it after a units save', async () => {
    renderProfile({}, { state: { result: makeResult() } })
    fireEvent.click(screen.getByRole('radio', { name: 'Imperial' }))

    expect(await screen.findByText('Units: Saved.')).toBeInTheDocument()
    expect(screen.getByRole('link', LEVELS)).toBeInTheDocument()
  })

  it('offers it after a bike weight save, on the settings bar', async () => {
    renderProfile({}, { state: { result: makeResult() } })
    const bike = screen.getByLabelText('Bike and gear weight')
    fireEvent.change(bike, { target: { value: '8.5' } })
    fireEvent.blur(bike)

    expect(
      await screen.findByText('Saved. Balance and ride results now use this.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', LEVELS)).toBeInTheDocument()
  })

  it('offers it after a year save for a signed-in visitor', async () => {
    renderProfile({ signedIn: true, email: EMAIL }, { state: { result: makeResult() } })
    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1985' } })
    fireEvent.blur(year)

    expect(await screen.findByText('Year of birth: Saved.')).toBeInTheDocument()
    expect(screen.getByRole('link', LEVELS)).toBeInTheDocument()
  })

  it('offers no link after a refused year, even when a later sex saves', async () => {
    const onSaveProfile = vi.fn(async (patch: ProfilePatch) => {
      if ('birthYear' in patch) throw new Error('Offline')
    })
    renderProfile({ sex: 'male', onSaveProfile }, { state: { result: makeResult() } })
    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1985' } })
    fireEvent.blur(year)
    expect(await screen.findByText("Year of birth: Couldn't save. Try again.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Woman' }))
    await waitFor(() => expect(screen.queryByText('Sex: Saving…')).not.toBeInTheDocument())

    expect(screen.getByText("Year of birth: Couldn't save. Try again.")).toBeInTheDocument()
    expect(screen.queryByRole('link', LEVELS)).not.toBeInTheDocument()
  })

  it('hides the settings bar link while a year save is pending, after a weight save', async () => {
    renderProfile({ onSaveProfile: vi.fn(SAVING_YEAR) }, { state: { result: makeResult() } })
    const body = screen.getByLabelText('Body weight')
    fireEvent.change(body, { target: { value: '76' } })
    fireEvent.blur(body)
    expect(
      await screen.findByText('Saved. Balance and ride results now use this.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', LEVELS)).toBeInTheDocument()

    const year = screen.getByLabelText('Year of birth')
    fireEvent.change(year, { target: { value: '1985' } })
    fireEvent.blur(year)

    expect(screen.getByText('Year of birth: Saving…')).toBeInTheDocument()
    expect(screen.queryByRole('link', LEVELS)).not.toBeInTheDocument()
  })

  it('hides the status line link while a weight save is pending, after a sex save', async () => {
    const onSaveProfile = vi.fn((patch: ProfilePatch) =>
      'settings' in patch ? new Promise<void>(() => undefined) : Promise.resolve(),
    )
    renderProfile({ sex: 'male', onSaveProfile }, { state: { result: makeResult() } })
    fireEvent.click(screen.getByRole('radio', { name: 'Woman' }))
    expect(await screen.findByText('Sex: Saved.')).toBeInTheDocument()
    expect(screen.getByRole('link', LEVELS)).toBeInTheDocument()

    const body = screen.getByLabelText('Body weight')
    fireEvent.change(body, { target: { value: '76' } })
    fireEvent.blur(body)

    expect(screen.getByText('Sex: Saved.')).toBeInTheDocument()
    expect(screen.queryByRole('link', LEVELS)).not.toBeInTheDocument()
  })
})

describe('ProfilePage zones and dated settings', () => {
  it('says zones appear once there is something to cut them from', () => {
    renderProfile()
    expect(screen.getByRole('heading', { level: 2, name: 'Training zones' })).toBeInTheDocument()
    expect(screen.getByText(/Zones appear once you add files/)).toBeInTheDocument()
  })

  it('shows a table for each sport and measure the analysis has a reference for', () => {
    const result = makeResult({ runMaxHeartRate: 190, rideMaxHeartRate: 180 })
    renderProfile({}, { state: { result, zoneEstimates: estimatesFrom(result) } })
    for (const name of [
      /^Run heart rate zones/,
      /^Run pace zones/,
      /^Ride heart rate zones/,
      /^Ride power zones/,
    ]) {
      expect(screen.getByRole('table', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('table', { name: /^Run pace zones/ })).toHaveAccessibleName(
      /From your runs: threshold pace/,
    )
    expect(screen.getByRole('table', { name: /^Ride power zones/ })).toHaveAccessibleName(
      /From your rides: threshold power/,
    )
  })

  it('opens the dated max heart rate form to the figure when Set it is pressed beside an estimate', () => {
    const result = makeResult({ runMaxHeartRate: 201, rideMaxHeartRate: 195 })
    const estimates = {
      ...estimatesFrom(result),
      runObservedMaxHeartRate: 201,
      observedMaxSource: { run: { bpm: 201, days: 3, sinceMs: Date.UTC(2023, 2, 15) }, ride: null },
    }
    renderProfile({}, { state: { result, zoneEstimates: estimates } })
    const setting = screen.getByLabelText('Setting') as HTMLSelectElement
    expect(setting.value).not.toBe('maxHeartRate.run')

    fireEvent.click(screen.getByRole('button', { name: 'Set it for your run max heart rate' }))
    expect(setting.value).toBe('maxHeartRate.run')
    const value = screen.getByLabelText('Value (bpm)') as HTMLInputElement
    expect(value.value).toBe('201')
    expect(value).toHaveFocus()

    // Asking again for the other sport moves the form to it.
    fireEvent.click(screen.getByRole('button', { name: 'Set it for your ride max heart rate' }))
    expect(setting.value).toBe('maxHeartRate.ride')
    expect(value.value).toBe('195')
  })

  it('shows the form with the figure while the dated settings load, and focuses it once they are ready', () => {
    const result = makeResult({ runMaxHeartRate: 201, rideMaxHeartRate: 195 })
    const estimates = { ...estimatesFrom(result), runObservedMaxHeartRate: 201 }
    const loading = { entries: [], state: 'loading' as const, elsewhere: 0, retry: vi.fn() }
    const { rerenderWith } = renderProfile(
      { dated: loading },
      { state: { result, zoneEstimates: estimates } },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Set it for your run max heart rate' }))
    // The form says why it cannot be used yet, and holds the figure.
    expect(screen.getByText('Loading your settings…')).toBeInTheDocument()
    expect((screen.getByLabelText('Value (bpm)') as HTMLInputElement).value).toBe('201')
    expect(screen.getByLabelText('Value (bpm)')).not.toHaveFocus()

    rerenderWith({ dated: { ...loading, state: 'ready' } })
    expect(screen.getByLabelText('Value (bpm)')).toHaveFocus()
    expect((screen.getByLabelText('Value (bpm)') as HTMLInputElement).value).toBe('201')
  })

  it('cuts estimated zones from the library’s references, not from the period’s result', () => {
    const period = makeResult({ runMaxHeartRate: 187, rideMaxHeartRate: 181 })
    const library = makeResult({ runMaxHeartRate: 192, rideMaxHeartRate: 186 })
    renderProfile({}, { state: { result: period, zoneEstimates: estimatesFrom(library) } })
    expect(screen.getByRole('table', { name: /^Run heart rate zones/ })).toHaveAccessibleName(
      /Max heart rate: 192 bpm/,
    )
    expect(screen.getByRole('table', { name: /^Ride heart rate zones/ })).toHaveAccessibleName(
      /Max heart rate: 186 bpm/,
    )
  })

  it('shows a dated threshold as entered, and cuts its zones from it', () => {
    const entries: Measurement[] = [
      { kind: 'thresholdPower', sport: 'ride', value: 250, from: '2020-01-01' },
    ]
    renderProfile(
      {
        athlete: { ...SETTINGS, measurements: entries },
        dated: { entries, state: 'ready', elsewhere: 0, retry: vi.fn() },
      },
      { state: { result: makeResult(), zoneEstimates: estimatesFrom(makeResult()) } },
    )
    const table = screen.getByRole('table', { name: /^Ride power zones/ })
    expect(table).toHaveAccessibleName(/You entered: threshold power 250 W/)
    expect(within(table).getByText('375 W or more')).toBeInTheDocument()
    expect(within(table).getByText('Lactate threshold')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Your dated settings' })).toBeInTheDocument()
  })

  it('names the published scheme under each zone table', () => {
    renderProfile(
      {},
      {
        state: {
          result: makeResult({ rideMaxHeartRate: 180 }),
          zoneEstimates: estimatesFrom(makeResult({ rideMaxHeartRate: 180 })),
        },
      },
    )
    expect(
      screen.getByText(/Allen and Coggan, Training and Racing with a Power Meter/),
    ).toBeVisible()
    expect(screen.getByText(/Friel, The Triathlete's Training Bible/)).toBeVisible()
    expect(screen.getByText(/Edwards, The Heart Rate Monitor Book/)).toBeVisible()
  })

  it('shows no estimated ride power zones, and says a weight is needed, when none is entered', () => {
    const result = makeResult({ runMaxHeartRate: 190, rideMaxHeartRate: 180 })
    renderProfile(
      { settings: { massKg: null, bikeMassKg: 9 } },
      { state: { result, zoneEstimates: estimatesFrom(result) } },
    )
    expect(screen.queryByRole('table', { name: /^Ride power zones/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Add your body weight to see ride power zones/)).toBeInTheDocument()
    // The zones that do not need a weight are still there.
    expect(screen.getByRole('table', { name: /^Run pace zones/ })).toBeInTheDocument()
  })

  it('still shows an entered threshold power without a weight', () => {
    const entries: Measurement[] = [
      { kind: 'thresholdPower', sport: 'ride', value: 250, from: '2020-01-01' },
    ]
    renderProfile(
      {
        settings: { massKg: null, bikeMassKg: 9 },
        athlete: { ...SETTINGS, measurements: entries },
      },
      { state: { result: makeResult(), zoneEstimates: estimatesFrom(makeResult()) } },
    )
    expect(screen.getByRole('table', { name: /^Ride power zones/ })).toHaveAccessibleName(
      /You entered/,
    )
  })

  describe('with the sample athlete on screen', () => {
    const sample = (
      zoneEstimates = estimatesFrom(makeResult({ runMaxHeartRate: 170, rideMaxHeartRate: 160 })),
    ) => ({
      state: { result: makeResult(), isSample: true, zoneEstimates },
    })

    it('shows the sample’s settings read-only, with a line that says whose they are', () => {
      const { onSaveProfile } = renderProfile({ birthYear: null, sex: null }, sample())

      expect(
        screen.getByText(
          "These are the sample athlete's settings. Add your files to use your own.",
        ),
      ).toBeInTheDocument()
      const list = screen.getByRole('heading', { name: 'Sample athlete' }).closest('section')!
      expect(within(list).getByText('Year of birth').nextElementSibling).toHaveTextContent(
        String(SAMPLE_PROFILE.birthYear),
      )
      expect(within(list).getByText('Sex').nextElementSibling).toHaveTextContent('Man')
      expect(within(list).getByText('Body weight').nextElementSibling).toHaveTextContent('75 kg')
      expect(screen.queryByRole('textbox', { name: 'Year of birth' })).not.toBeInTheDocument()
      expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Settings over time' })).not.toBeInTheDocument()
      expect(onSaveProfile).not.toHaveBeenCalled()
    })

    it('keeps the units editable, since they are how the visitor reads every figure', () => {
      const { onSaveProfile } = renderProfile({}, sample())
      fireEvent.click(screen.getByRole('radio', { name: 'Imperial' }))
      expect(onSaveProfile).toHaveBeenCalledWith({ units: 'imperial' })
    })

    it('shows the sample’s zones, not the visitor’s own dated settings', () => {
      const entries: Measurement[] = [
        { kind: 'maxHeartRate', sport: 'run', value: 188, from: '2020-01-01' },
      ]
      renderProfile(
        {
          athlete: { ...SETTINGS, measurements: entries },
          dated: { entries, state: 'ready', elsewhere: 0, retry: vi.fn() },
        },
        sample(),
      )
      expect(screen.getByRole('table', { name: /^Run heart rate zones/ })).toHaveAccessibleName(
        /Max heart rate: 170 bpm/,
      )
      expect(screen.queryByText(/188 bpm/)).not.toBeInTheDocument()
    })

    it('has no read-only list once the visitor’s own files are on screen', () => {
      renderProfile({}, { state: { result: makeResult(), isSample: false } })
      expect(screen.queryByRole('heading', { name: 'Sample athlete' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'About you' })).toBeInTheDocument()
    })
  })

  it('says when dated settings kept in this browser are not the account’s', () => {
    renderProfile({
      signedIn: true,
      email: EMAIL,
      dated: { entries: [], state: 'ready', elsewhere: 2, retry: vi.fn() },
    })
    expect(
      screen.getByText(/This browser also holds 2 dated settings from before you signed in/),
    ).toBeInTheDocument()
  })
})
