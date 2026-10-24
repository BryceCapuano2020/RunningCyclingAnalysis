// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { keptLibraryHinted, setKeptLibraryHinted } from './keptLibrary'

beforeEach(() => localStorage.clear())

afterEach(() => {
  vi.restoreAllMocks()
})

describe('keptLibraryHinted', () => {
  it('is false on a first visit', () => {
    expect(keptLibraryHinted()).toBe(false)
  })

  it('is true once the hint is set, and false again once it is cleared', () => {
    setKeptLibraryHinted(true)
    expect(keptLibraryHinted()).toBe(true)

    setKeptLibraryHinted(false)
    expect(keptLibraryHinted()).toBe(false)
  })

  it('counts refused storage as no hint, and does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Blocked', 'SecurityError')
    })
    expect(keptLibraryHinted()).toBe(false)
  })

  it('does not throw when the browser refuses to store the hint', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })
    expect(() => setKeptLibraryHinted(true)).not.toThrow()
  })
})
