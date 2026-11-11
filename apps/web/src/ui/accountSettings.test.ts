// @vitest-environment jsdom
import type { AccountSettings } from '@rca/contract'
import { analysisSettings } from './athlete'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/settings'
import { ApiRequestError } from '../api/client'
import {
  browserSettings,
  forgetAccountChoices,
  SETTINGS_OWNER_KEY,
  settle,
} from './accountSettings'
import { browserZone } from './analysis/copyAge'
import { loadCountedRuns, storeCountedRuns } from './countedRunsStore'
import { resetKeptPowerCache, useKeptPower } from './keptPowerStore'
import { storedPeriodChoice } from './periodPreference'
import {
  CHOICE_NOT_SAVED,
  CHOICE_REFUSED,
  CHOICE_SIGNED_OUT,
  retryWaitMs,
  SETTINGS_RETRY_MAX_MS,
  SETTINGS_RETRY_MS,
  useAccountSettings,
} from './useAccountSettings'
import { onOwnChange as ownChange, resetTabSync } from './tabSync'
import { FakeBroadcastChannel } from '../test/fakeBroadcastChannel'
import { settingsChosen } from './settingsChosen'

vi.mock('../api/settings', () => ({ getAccountSettings: vi.fn(), putAccountSettings: vi.fn() }))

const ZONE = browserZone()
// An account that already holds this browser's zone, so only the choices decide what is saved.
const NONE: AccountSettings = { keepPower: null, countedRuns: null, period: null, zone: ZONE }
const CHOICES: AccountSettings = {
  keepPower: ['ride-a'],
  countedRuns: ['run-1700000000'],
  period: 182,
}
const ACCOUNT: AccountSettings = { ...CHOICES, zone: ZONE }

const get = vi.mocked(api.getAccountSettings)
const put = vi.mocked(api.putAccountSettings)

beforeEach(() => {
  get.mockReset()
  put.mockReset()
  put.mockImplementation(async (settings) => settings)
})
afterEach(() => {
  cleanup()
  localStorage.clear()
  resetKeptPowerCache()
})

/** The athlete picks a period the account does not hold. */
function choosePeriod() {
  localStorage.setItem('rca.period.v1', JSON.stringify(42))
  settingsChosen('period')
}

/** Puts the choices a signed-out visit made into this browser. */
function chooseSignedOut() {
  localStorage.setItem('rca.keepPower.v1', JSON.stringify(['ride-z']))
  localStorage.setItem('rca.countedRuns.v1', JSON.stringify(['run-1700000500']))
  localStorage.setItem('rca.period.v1', JSON.stringify('all'))
  resetKeptPowerCache()
}

describe('settle', () => {
  const browser: AccountSettings = { keepPower: ['ride-z'], countedRuns: null, period: 'all' }

  it('takes the account value for every field it holds, whatever the browser has, once the copy mirrors it', () => {
    expect(settle(CHOICES, browser, false, new Set())).toEqual(CHOICES)
  })

  it('fills a field the account never had from the browser, once, when the copy predates sign-in', () => {
    expect(settle({ ...CHOICES, period: null }, browser, true, new Set())).toEqual({
      keepPower: ['ride-a', 'ride-z'],
      countedRuns: CHOICES.countedRuns,
      period: 'all',
    })
  })

  it('does not offer a copy that already mirrors the account, so a clear elsewhere stays cleared', () => {
    expect(
      settle({ keepPower: null, countedRuns: null, period: null }, browser, false, new Set()),
    ).toEqual({ keepPower: null, countedRuns: null, period: null })
  })

  it('joins the two lists once when both sides hold values, the account first, and keeps its period', () => {
    const theirs: AccountSettings = {
      keepPower: ['ride-z', 'ride-a'],
      countedRuns: ['run-1700000999'],
      period: 'all',
    }
    expect(settle(CHOICES, theirs, true, new Set())).toEqual({
      keepPower: ['ride-a', 'ride-z'],
      countedRuns: ['run-1700000000', 'run-1700000999'],
      period: 182,
    })
    // Not offered again once the copy mirrors the account: the account replaces it.
    expect(settle(CHOICES, theirs, false, new Set())).toEqual(CHOICES)
  })

  it('keeps a choice made while the account was loading', () => {
    expect(settle(CHOICES, browser, false, new Set(['period']))).toEqual({
      ...CHOICES,
      period: 'all',
    })
  })
})

describe('useAccountSettings', () => {
  it('on first sign-in, saves the choices made signed out to an account that has none', async () => {
    chooseSignedOut()
    get.mockResolvedValue(NONE)
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put).toHaveBeenCalledWith(
      { keepPower: ['ride-z'], countedRuns: ['run-1700000500'], period: 'all', zone: ZONE },
      'u1',
    )
    expect(localStorage.getItem(SETTINGS_OWNER_KEY)).toBe('u1')
  })

  it("lets the account's values win, writes them into the browser and saves nothing", async () => {
    chooseSignedOut()
    // This browser's copy already mirrors the account, so nothing of it is offered.
    localStorage.setItem(SETTINGS_OWNER_KEY, 'u1')
    get.mockResolvedValue(ACCOUNT)
    const kept = renderHook(() => useKeptPower())
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(kept.result.current.ids).toEqual(['ride-a']))
    expect(loadCountedRuns()).toEqual(['run-1700000000'])
    expect(storedPeriodChoice()).toBe(182)
    expect(put).not.toHaveBeenCalled()
  })

  it("on a second device, adds this browser's earlier choices to the account's and saves the union", async () => {
    chooseSignedOut()
    get.mockResolvedValue(ACCOUNT)
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0]![0]).toEqual({
      keepPower: ['ride-a', 'ride-z'],
      countedRuns: ['run-1700000000', 'run-1700000500'],
      period: 182,
      zone: ZONE,
    })
    expect(localStorage.getItem(SETTINGS_OWNER_KEY)).toBe('u1')
  })

  it('offers the choices again on the retry when the first save fails, and loses neither side', async () => {
    chooseSignedOut()
    get.mockResolvedValue(NONE)
    put.mockRejectedValueOnce(new Error('offline'))
    vi.useFakeTimers()
    try {
      renderHook(() => useAccountSettings('signed-in', 'u1'))
      await vi.advanceTimersByTimeAsync(100)
      expect(put).toHaveBeenCalledTimes(1)
      // The failed save did not mark the copy as the account's, so it is still offered.
      expect(localStorage.getItem(SETTINGS_OWNER_KEY)).toBeNull()
      await vi.advanceTimersByTimeAsync(3000)
      expect(put).toHaveBeenCalledTimes(2)
      expect(put.mock.calls[1]![0]).toEqual({
        keepPower: ['ride-z'],
        countedRuns: ['run-1700000500'],
        period: 'all',
        zone: ZONE,
      })
      expect(localStorage.getItem(SETTINGS_OWNER_KEY)).toBe('u1')
      expect(loadCountedRuns()).toEqual(['run-1700000500'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('reads one AthleteSettings: what the analysis runs on equals the account document', async () => {
    get.mockResolvedValue(ACCOUNT)
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(loadCountedRuns()).toHaveLength(1))
    const browser = browserSettings()
    const fromBrowser = analysisSettings(
      { massKg: 70, bikeMassKg: 9 },
      [],
      null,
      browser.countedRuns ?? [],
      browser.keepPower ?? [],
    )
    const fromAccount = analysisSettings(
      { massKg: 70, bikeMassKg: 9 },
      [],
      null,
      ACCOUNT.countedRuns ?? [],
      ACCOUNT.keepPower ?? [],
    )
    expect(fromBrowser).toEqual(fromAccount)
  })

  it('saves a later choice to the account, and a clear of the browser copy is not a choice', async () => {
    get.mockResolvedValue(ACCOUNT)
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(loadCountedRuns()).toHaveLength(1))
    storeCountedRuns(['run-1700000000', 'run-1700000999'])
    act(() => settingsChosen('countedRuns'))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0]![0]).toEqual({
      ...ACCOUNT,
      countedRuns: ['run-1700000000', 'run-1700000999'],
    })
    forgetAccountChoices()
    storeCountedRuns([])
    await Promise.resolve()
    expect(put).toHaveBeenCalledTimes(1)
  })

  it("never offers another account's copy to this one", async () => {
    chooseSignedOut()
    localStorage.setItem(SETTINGS_OWNER_KEY, 'someone-else')
    get.mockResolvedValue(NONE)
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(localStorage.getItem(SETTINGS_OWNER_KEY)).toBe('u1'))
    expect(put).not.toHaveBeenCalled()
    expect(browserSettings()).toEqual({ keepPower: null, countedRuns: null, period: null })
  })

  it('sends nothing until the account has been read, so a stale copy cannot overwrite it', async () => {
    get.mockRejectedValue(new Error('offline'))
    vi.useFakeTimers()
    try {
      renderHook(() => useAccountSettings('signed-in', 'u1'))
      await vi.advanceTimersByTimeAsync(5000)
      act(choosePeriod)
      await vi.advanceTimersByTimeAsync(10)
      expect(get).toHaveBeenCalledTimes(2)
      expect(put).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does nothing signed out', async () => {
    renderHook(() => useAccountSettings('signed-out', null))
    act(choosePeriod)
    await Promise.resolve()
    expect(get).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
  })
})

describe('the zone', () => {
  it('is sent once to an account that holds another zone, and not again when another device moves it back, so two devices do not flip it', async () => {
    get.mockResolvedValue({ ...ACCOUNT, zone: 'Pacific/Apia' })
    const first = renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0]![0].zone).toBe(ZONE)
    first.unmount()
    // The other device took it back; this one has told the account where it is, and does not on a later read.
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(put).toHaveBeenCalledTimes(1)
  })

  it('is not told to an account that already holds this zone, whatever this device last reported', async () => {
    get.mockResolvedValue(ACCOUNT)
    const view = renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(loadCountedRuns()).toHaveLength(1))
    expect(put).not.toHaveBeenCalled()
    view.unmount()
    localStorage.setItem('rca-zone-reported:u1', 'Pacific/Apia')
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    await new Promise((resolve) => setTimeout(resolve, 30))
    // The account holds this zone already: nothing to tell.
    expect(put).not.toHaveBeenCalled()
  })

  it('is sent when the account has never had one', async () => {
    const { zone: _zone, ...noZone } = ACCOUNT
    get.mockResolvedValue(noZone)
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0]![0].zone).toBe(ZONE)
  })

  it('is not sent again when the account already holds it', async () => {
    get.mockResolvedValue(ACCOUNT)
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(loadCountedRuns()).toHaveLength(1))
    expect(put).not.toHaveBeenCalled()
  })

  it('rides along with a later save', async () => {
    get.mockResolvedValue(ACCOUNT)
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(loadCountedRuns()).toHaveLength(1))
    act(choosePeriod)
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0]![0].zone).toBe(ZONE)
  })
})

describe('the zone, for every signed-in account', () => {
  it('is sent with a first save and with each later one, with no flag from /api/me', async () => {
    chooseSignedOut()
    get.mockResolvedValue({ keepPower: null, countedRuns: null, period: null })
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    expect(put.mock.calls[0]![0].zone).toBe(ZONE)
    act(choosePeriod)
    await waitFor(() => expect(put).toHaveBeenCalledTimes(2))
    expect(put.mock.calls[1]![0].zone).toBe(ZONE)
  })

  it('is dropped when this browser reports one the server would refuse, so the settings still sync', async () => {
    const reported = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ timeZone: 'Etc/Unknown' } as Intl.ResolvedDateTimeFormatOptions)
    const known = Intl.DateTimeFormat
    vi.stubGlobal('Intl', {
      ...Intl,
      DateTimeFormat: function (_locale?: string, options?: Intl.DateTimeFormatOptions) {
        if (options?.timeZone === 'Etc/Unknown') throw new RangeError('Invalid time zone')
        return new known()
      },
    })
    try {
      chooseSignedOut()
      get.mockResolvedValue({ keepPower: null, countedRuns: null, period: null })
      renderHook(() => useAccountSettings('signed-in', 'u1'))
      await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
      expect(put.mock.calls[0]![0]).not.toHaveProperty('zone')
      expect(put.mock.calls[0]![0].keepPower).toEqual(['ride-z'])
    } finally {
      vi.unstubAllGlobals()
      reported.mockRestore()
    }
  })
})

describe('a saved choice', () => {
  it('is announced to this tab and the others once the account has it, so the results are asked for again', async () => {
    get.mockResolvedValue(ACCOUNT)
    const heard: string[] = []
    const stop = ownChange((message) => heard.push(message.type))
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(loadCountedRuns()).toHaveLength(1))
    expect(heard).toEqual([])
    act(choosePeriod)
    await waitFor(() => expect(heard).toEqual(['settings']))
    stop()
  })

  it('is not announced when the save fails', async () => {
    get.mockResolvedValue(ACCOUNT)
    const heard: string[] = []
    const stop = ownChange((message) => heard.push(message.type))
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(loadCountedRuns()).toHaveLength(1))
    put.mockRejectedValueOnce(new Error('offline'))
    act(choosePeriod)
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(heard).toEqual([])
    stop()
  })
})

describe('signing out or deleting the account', () => {
  it('takes the notes of the zone this device told each account, beside the note of whose settings these are', () => {
    localStorage.setItem('rca-zone-reported:u1', 'Pacific/Apia')
    localStorage.setItem('rca-zone-reported:u2', 'Europe/Paris')
    localStorage.setItem(SETTINGS_OWNER_KEY, 'u1')
    localStorage.setItem('unrelated', 'kept')
    forgetAccountChoices()
    expect(localStorage.getItem('rca-zone-reported:u1')).toBeNull()
    expect(localStorage.getItem('rca-zone-reported:u2')).toBeNull()
    expect(localStorage.getItem(SETTINGS_OWNER_KEY)).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('kept')
  })
})

describe('a choice that is not saved', () => {
  const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is tried again after waits that double, and the page is told it is not saved until it is', async () => {
    get.mockResolvedValue(ACCOUNT)
    const view = renderHook(() => useAccountSettings('signed-in', 'u1'))
    await advance(0)
    expect(view.result.current.notSaved).toBe(false)
    put.mockRejectedValue(new Error('offline'))
    // The choice: a period the account does not hold.
    localStorage.setItem('rca.period.v1', JSON.stringify(42))
    act(choosePeriod)
    await advance(0)
    expect(put).toHaveBeenCalledTimes(1)
    expect(view.result.current.notSaved).toBe(true)
    expect(view.result.current.notice).toBe(CHOICE_NOT_SAVED)
    await advance(SETTINGS_RETRY_MS)
    expect(put).toHaveBeenCalledTimes(2)
    // The second wait is twice as long.
    await advance(SETTINGS_RETRY_MS)
    expect(put).toHaveBeenCalledTimes(2)
    put.mockImplementation(async (settings) => settings)
    await advance(SETTINGS_RETRY_MS)
    expect(put).toHaveBeenCalledTimes(3)
    expect(view.result.current.notSaved).toBe(false)
  })

  it('clears the notice when another tab saves the settings, and stops its own retry', async () => {
    resetTabSync()
    FakeBroadcastChannel.reset()
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    const otherTab = FakeBroadcastChannel.other('rca-sync-v1')
    get.mockResolvedValue(ACCOUNT)
    const view = renderHook(() => useAccountSettings('signed-in', 'u1'))
    await advance(0)
    put.mockRejectedValue(new Error('offline'))
    localStorage.setItem('rca.period.v1', JSON.stringify(42))
    act(choosePeriod)
    await advance(0)
    expect(view.result.current.notice).toBe(CHOICE_NOT_SAVED)
    // The other tab's save went through with the shared copy: the notice here is stale.
    act(() => otherTab.postMessage({ type: 'settings' }))
    expect(view.result.current.notSaved).toBe(false)
    expect(view.result.current.notice).toBe('')
    const calls = put.mock.calls.length
    await advance(SETTINGS_RETRY_MAX_MS)
    expect(put).toHaveBeenCalledTimes(calls)
    vi.unstubAllGlobals()
    resetTabSync()
  })

  it('reads the account again on a retry and sends only the fields this device chose, so another device’s newer choice is not overwritten', async () => {
    get.mockResolvedValue(ACCOUNT)
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await advance(0)
    put.mockRejectedValueOnce(new Error('offline'))
    localStorage.setItem('rca.period.v1', JSON.stringify(42))
    act(choosePeriod)
    await advance(0)
    expect(put).toHaveBeenCalledTimes(1)
    // Meanwhile another device changed the rides kept, which this one did not touch.
    get.mockResolvedValue({ ...ACCOUNT, keepPower: ['ride-from-the-phone'] })
    await advance(SETTINGS_RETRY_MS)
    await advance(0)
    expect(get.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(put).toHaveBeenCalledTimes(2)
    expect(put.mock.calls[1]![0]).toMatchObject({ keepPower: ['ride-from-the-phone'] })
    expect(put.mock.calls[1]![0].period).toBe(storedPeriodChoice())
  })

  it('keeps a choice made during a save queued: the first save ending does not clear it, and its retry still sends it', async () => {
    get.mockResolvedValue(ACCOUNT)
    const view = renderHook(() => useAccountSettings('signed-in', 'u1'))
    await advance(0)
    let finishFirst: (settings: AccountSettings) => void = () => undefined
    put.mockImplementationOnce(() => new Promise<AccountSettings>((done) => (finishFirst = done)))
    put.mockRejectedValueOnce(new Error('offline'))
    localStorage.setItem('rca.period.v1', JSON.stringify(42))
    act(choosePeriod)
    await advance(0)
    // The rides kept are chosen while the period is still being saved.
    localStorage.setItem('rca.keepPower.v1', JSON.stringify(['ride-new']))
    resetKeptPowerCache()
    act(() => settingsChosen('keepPower'))
    finishFirst({ ...ACCOUNT, period: 42 })
    await advance(0)
    await advance(0)
    expect(put).toHaveBeenCalledTimes(2)
    expect(view.result.current.notSaved).toBe(true)
    expect(view.result.current.notice).toBe(CHOICE_NOT_SAVED)
    // The retry reads the account (which still holds the old rides) and sends this device's choice over it.
    get.mockResolvedValue({ ...ACCOUNT, period: 42 })
    await advance(SETTINGS_RETRY_MS)
    await advance(0)
    expect(put).toHaveBeenCalledTimes(3)
    expect(put.mock.calls[2]![0]).toMatchObject({ keepPower: ['ride-new'], period: 42 })
    expect(view.result.current.notSaved).toBe(false)
  })

  it('reads the account before its first save too, so a copy left open for days does not overwrite another device', async () => {
    get.mockResolvedValue(ACCOUNT)
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await advance(0)
    get.mockResolvedValue({ ...ACCOUNT, keepPower: ['ride-from-the-phone'] })
    localStorage.setItem('rca.period.v1', JSON.stringify(42))
    act(choosePeriod)
    await advance(0)
    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0]![0]).toMatchObject({ keepPower: ['ride-from-the-phone'], period: 42 })
  })

  it('does not say it saves when the connection returns after the session ended', async () => {
    get.mockResolvedValue(ACCOUNT)
    const view = renderHook(() => useAccountSettings('signed-in', 'u1'))
    await advance(0)
    put.mockRejectedValue(new ApiRequestError(401, 'unauthorized', 'Sign in'))
    localStorage.setItem('rca.period.v1', JSON.stringify(42))
    act(choosePeriod)
    await advance(0)
    expect(view.result.current.notice).toBe(CHOICE_SIGNED_OUT)
    expect(view.result.current.notice).not.toMatch(/connection/)
  })

  it.each([
    ['a 429', new ApiRequestError(429, 'rate_limited', 'Slow down')],
    ['a 503', new ApiRequestError(503, 'unavailable', 'Try later')],
    ['a timeout', new ApiRequestError(408, 'timeout', 'Timed out')],
    ['no connection', new ApiRequestError(0, 'network_error', 'Could not reach the server')],
  ])('is tried again after %s', async (_name, failure) => {
    get.mockResolvedValue(ACCOUNT)
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await advance(0)
    put.mockRejectedValueOnce(failure)
    act(choosePeriod)
    await advance(0)
    await advance(SETTINGS_RETRY_MS)
    await advance(0)
    expect(put.mock.calls.length + get.mock.calls.length).toBeGreaterThan(2)
  })

  it.each([
    ['a 400', new ApiRequestError(400, 'invalid', 'Not accepted')],
    ['a 413', new ApiRequestError(413, 'too_large', 'Too large')],
  ])(
    'stops after %s and says the account did not accept it, with a different notice',
    async (_name, refusal) => {
      get.mockResolvedValue(ACCOUNT)
      const view = renderHook(() => useAccountSettings('signed-in', 'u1'))
      await advance(0)
      put.mockRejectedValue(refusal)
      act(choosePeriod)
      await advance(0)
      expect(view.result.current.notice).toBe(CHOICE_REFUSED)
      await advance(10 * SETTINGS_RETRY_MAX_MS)
      expect(put).toHaveBeenCalledTimes(1)
      expect(view.result.current.notice).toBe(CHOICE_REFUSED)
    },
  )

  it('goes on trying for as long as the page is open, with waits that stop doubling at a minute', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(retryWaitMs)).toEqual([
      2_000, 4_000, 8_000, 16_000, 32_000, 60_000, 60_000, 60_000,
    ])
  })

  it('sends the choices once a settings read that failed over and over answers, instead of never', async () => {
    chooseSignedOut()
    get.mockRejectedValue(new Error('offline'))
    const view = renderHook(() => useAccountSettings('signed-in', 'u1'))
    await advance(0)
    for (const wait of [2_000, 4_000, 8_000]) await advance(wait)
    expect(put).not.toHaveBeenCalled()
    // A choice made while the read is failing is not saved, and the page says so.
    act(() => settingsChosen('period'))
    expect(view.result.current.notSaved).toBe(true)
    get.mockResolvedValue(NONE)
    await advance(16_000)
    await advance(0)
    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0]![0]).toMatchObject({ keepPower: ['ride-z'], period: 'all' })
    expect(view.result.current.notSaved).toBe(false)
  })
})
