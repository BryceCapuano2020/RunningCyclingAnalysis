// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CARD_NAME_KEY,
  CARD_NAME_MAX,
  cardNameShown,
  capCardName,
  saveCardName,
  storedCardName,
} from './cardName'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('capCardName', () => {
  it('holds the name to the longest a card shows, 40 characters', () => {
    expect(CARD_NAME_MAX).toBe(40)
    expect(capCardName('a'.repeat(55))).toBe('a'.repeat(40))
  })

  it('keeps a name that is already short as it was typed, spaces at the end included', () => {
    expect(capCardName('Bryce ')).toBe('Bryce ')
  })

  it('never splits a character outside the basic plane in two', () => {
    const name = `${'a'.repeat(39)}😀x`
    expect(capCardName(name)).toBe(`${'a'.repeat(39)}😀`)
  })
})

describe('cardNameShown', () => {
  it('shows the name trimmed, and shows nothing for a blank name', () => {
    expect(cardNameShown('  Bryce Capuano ')).toBe('Bryce Capuano')
    expect(cardNameShown('   ')).toBeNull()
    expect(cardNameShown('')).toBeNull()
  })
})

describe('the name kept on this device', () => {
  it('is kept under its own key, and read back', () => {
    expect(CARD_NAME_KEY).toBe('rca.card-name.v1')
    saveCardName('Bryce')
    expect(localStorage.getItem(CARD_NAME_KEY)).toBe('Bryce')
    expect(storedCardName()).toBe('Bryce')
  })

  it('is empty by default, and an empty name removes what was kept', () => {
    expect(storedCardName()).toBe('')
    saveCardName('Bryce')
    saveCardName('')
    expect(localStorage.getItem(CARD_NAME_KEY)).toBeNull()
  })

  it('reads a stored name back capped, in case an older value is longer', () => {
    localStorage.setItem(CARD_NAME_KEY, 'b'.repeat(60))
    expect(storedCardName()).toBe('b'.repeat(CARD_NAME_MAX))
  })

  it('is not an error when storage is refused: the card still takes the name for this visit', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => saveCardName('Bryce')).not.toThrow()
    expect(storedCardName()).toBe('')
  })
})
