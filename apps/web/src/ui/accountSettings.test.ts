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
import { loadCountedRuns, storeCountedRuns } from './countedRunsStore'
import { resetKeptPowerCache, useKeptPower } from './keptPowerStore'
import { storedPeriodChoice } from './periodPreference'
import { useAccountSettings } from './useAccountSettings'
import { settingsChosen } from './settingsChosen'

vi.mock('../api/settings', () => ({ getAccountSettings: vi.fn(), putAccountSettings: vi.fn() }))

const NONE: AccountSettings = { keepPower: null, countedRuns: null, period: null }
const ACCOUNT: AccountSettings = {
  keepPower: ['ride-a'],
  countedRuns: ['run-1700000000'],
  period: 182,
}

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

  it('takes the account value for every field it holds, whatever the browser has', () => {
    expect(settle(ACCOUNT, browser, true, new Set())).toEqual(ACCOUNT)
  })

  it('fills a field the account never had from the browser, once, when the copy predates sign-in', () => {
    expect(settle({ ...ACCOUNT, period: null }, browser, true, new Set())).toEqual({
      ...ACCOUNT,
      period: 'all',
    })
  })

  it('does not offer a copy that already mirrors the account, so a clear elsewhere stays cleared', () => {
    expect(settle(NONE, browser, false, new Set())).toEqual(NONE)
  })

  it('keeps a choice made while the account was loading', () => {
    expect(settle(ACCOUNT, browser, false, new Set(['period']))).toEqual({
      ...ACCOUNT,
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
      { keepPower: ['ride-z'], countedRuns: ['run-1700000500'], period: 'all' },
      'u1',
    )
    expect(localStorage.getItem(SETTINGS_OWNER_KEY)).toBe('u1')
  })

  it("lets the account's values win, writes them into the browser and saves nothing", async () => {
    chooseSignedOut()
    get.mockResolvedValue(ACCOUNT)
    const kept = renderHook(() => useKeptPower())
    renderHook(() => useAccountSettings('signed-in', 'u1'))
    await waitFor(() => expect(kept.result.current.ids).toEqual(['ride-a']))
    expect(loadCountedRuns()).toEqual(['run-1700000000'])
    expect(storedPeriodChoice()).toBe(182)
    expect(put).not.toHaveBeenCalled()
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
    expect(browserSettings()).toEqual(NONE)
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
