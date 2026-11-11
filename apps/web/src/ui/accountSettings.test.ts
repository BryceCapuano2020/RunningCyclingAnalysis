// @vitest-environment jsdom
import type { AccountSettings } from '@rca/contract'
import { analysisSettings } from './athlete'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api/settings'
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
import { useAccountSettings } from './useAccountSettings'
import { onOwnChange as ownChange } from './tabSync'
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
      act(() => settingsChosen('period'))
      await vi.advanceTimersByTimeAsync(10)
      expect(get).toHaveBeenCalledTimes(2)
      expect(put).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does nothing signed out', async () => {
    renderHook(() => useAccountSettings('signed-out', null))
    act(() => settingsChosen('period'))
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
    act(() => settingsChosen('period'))
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
    act(() => settingsChosen('period'))
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
    act(() => settingsChosen('period'))
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
    act(() => settingsChosen('period'))
    await waitFor(() => expect(put).toHaveBeenCalledTimes(1))
    await Promise.resolve()
    expect(heard).toEqual([])
    stop()
  })
})
