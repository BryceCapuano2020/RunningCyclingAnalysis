// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RELOAD_GUARD_MS, reloadOnceForNewBuild } from './staleBuild'

beforeEach(() => sessionStorage.clear())

describe('reloading for a newer build', () => {
  it('reloads once, then not again for a tab that is still old after it', () => {
    const reload = vi.fn()
    expect(reloadOnceForNewBuild(1_000, reload)).toBe(true)
    expect(reloadOnceForNewBuild(2_000, reload)).toBe(false)
    expect(reloadOnceForNewBuild(1_000 + RELOAD_GUARD_MS - 1, reload)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reloads again once the guard has run out', () => {
    const reload = vi.fn()
    reloadOnceForNewBuild(1_000, reload)
    expect(reloadOnceForNewBuild(1_000 + RELOAD_GUARD_MS, reload)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(2)
  })

  it('does not reload where storage cannot hold the guard, so it cannot loop', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const reload = vi.fn()
    expect(reloadOnceForNewBuild(1_000, reload)).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })
})
