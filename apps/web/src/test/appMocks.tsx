import { vi } from 'vitest'
import type { Me, Profile, ProfileInput } from '@rca/contract'
import type { Measurement } from '@rca/core/athlete'
import type { AnalysisResult } from '@rca/core/pipeline'
import type { SessionState } from '@rca/core/session'
import { makeResult } from '../ui/components/fixtures'
import type { AccountController, AccountStatus } from '../ui/useAccount'
import type { AnalysisController } from '../ui/useAnalysis'
import type { Preferences } from '../ui/useSettings'
import { analysisStub } from './analysisStub'

/*
 * Shared by the App test files. Each file mocks the three hooks and the costly charts with the
 * factories below, and every page and component under App renders for real.
 */

const DEFAULT_PREFERENCES: Preferences = {
  settings: { massKg: null, bikeMassKg: 9 },
  units: 'imperial',
  birthYear: null,
  sex: null,
  setupDone: false,
}

/** Resolves with the profile the account now holds: the current signed-in profile with the patch applied. */
export const updateProfile = vi.fn<(patch: Partial<ProfileInput>) => Promise<Profile>>(
  async (patch) => ({ ...(app.account.me?.profile ?? meFor().profile), ...patch, updatedAt: 2000 }),
)
export const setPreferences = vi.fn<(next: Preferences) => void>()

/** The dated-settings API, answering an empty list, for the App tests that save a weight. */
export const measurementsApi = {
  listMeasurements: vi.fn(async (): Promise<Measurement[]> => []),
  putMeasurement: vi.fn(async (entry: Measurement) => entry),
  deleteMeasurement: vi.fn(async () => undefined),
}

export interface AccountOptions {
  keepFiles?: boolean
  fileRetentionAvailable?: boolean
  units?: Profile['units']
}

/** The signed-in user's account, with its saved profile. */
export function meFor({
  keepFiles = true,
  fileRetentionAvailable = true,
  units = 'imperial',
}: AccountOptions = {}): Me {
  return {
    user: { id: 'user-1', email: 'ada@example.com', name: 'Ada Lovelace', pictureUrl: null },
    profile: {
      massKg: 75,
      bikeMassKg: 9,
      units,
      keepFiles,
      birthYear: null,
      sex: null,
      updatedAt: 1000,
    },
    fileRetentionAvailable,
  }
}

/** A signed-in library that has loaded, which is what the App tests start from. */
function freshAnalysis(): AnalysisController {
  return analysisStub({ libraryStatus: 'loaded' })
}

function makeAccount(): AccountController {
  return {
    status: 'signed-in',
    me: meFor(),
    sessionExpired: false,
    lookupPending: false,
    flushProfileWrites: vi.fn(async () => null),
    signIn: vi.fn(),
    signOut: vi.fn(async () => undefined),
    deleteAccount: vi.fn(async () => undefined),
    updateProfile,
    markExpired: vi.fn(),
    refresh: vi.fn(async () => null),
    retryLookup: vi.fn(),
    error: null,
  }
}

/** The state the hooks return. Tests change it through the helpers below or directly. */
export const app = {
  analysis: freshAnalysis(),
  account: makeAccount(),
  preferences: DEFAULT_PREFERENCES,
}

export function useAnalysisMock(): AnalysisController {
  return app.analysis
}

export function useAccountMock(): AccountController {
  return app.account
}

export function usePreferencesMock(): [Preferences, (next: Preferences) => void] {
  return [app.preferences, setPreferences]
}

/** The costly charts. */
export const heavyChartStubs = {
  CurveChart: () => null,
  SportCurveChart: () => null,
  RatioChart: () => null,
  HrScatter: () => null,
  AccuracyScatter: () => null,
}

/** Signs the test user in (with the given options), out, or marks the account unavailable. */
export function setAccount(status: AccountStatus, options: AccountOptions = {}): void {
  app.account.status = status
  app.account.me = status === 'signed-in' ? meFor(options) : null
}

/** Changes some fields of the analysis session: notices, trend, sample flag and so on. */
export function setSession(patch: Partial<SessionState>): void {
  app.analysis.state = { ...app.analysis.state, ...patch }
}

/** Gives the page a result to show, as a finished import would. */
export function showResult(result: AnalysisResult = makeResult()): void {
  setSession({ result, library: result.activities, totalActivities: result.activities.length })
}

/** The text of every status region on the page, mounted or not. */
export function announcements(): string[] {
  return Array.from(document.querySelectorAll('[role="status"]'), (node) => node.textContent ?? '')
}

/** Back to the landing page, signed in, with no result and every mock at its start. */
export function resetAppMocks(): void {
  app.analysis = freshAnalysis()
  app.account = makeAccount()
  app.preferences = DEFAULT_PREFERENCES
  updateProfile.mockReset()
  setPreferences.mockReset()
  measurementsApi.listMeasurements.mockReset().mockResolvedValue([])
  measurementsApi.putMeasurement.mockReset().mockImplementation(async (entry) => entry)
  measurementsApi.deleteMeasurement.mockReset().mockResolvedValue(undefined)
  // jsdom does not scroll, and App scrolls to the top whenever the page changes.
  window.scrollTo = () => undefined
  window.location.hash = ''
}
