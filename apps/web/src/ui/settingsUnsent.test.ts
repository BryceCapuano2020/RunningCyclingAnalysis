import { beforeEach, describe, expect, it } from 'vitest'
import {
  choicesSoFar,
  noteChoice,
  noteSettled,
  resetUnsent,
  settingsUnsent,
} from './settingsUnsent'

beforeEach(resetUnsent)

describe('settings not yet sent', () => {
  it('start with nothing unsent', () => {
    expect(settingsUnsent()).toBe(false)
  })

  it('count from a choice until a save that began after it settles', () => {
    noteChoice()
    expect(settingsUnsent()).toBe(true)
    const carried = choicesSoFar()
    noteChoice()
    noteSettled(carried)
    // The save carried the first choice only.
    expect(settingsUnsent()).toBe(true)
    noteSettled(choicesSoFar())
    expect(settingsUnsent()).toBe(false)
  })

  it('never move back when an older save settles late', () => {
    noteChoice()
    noteChoice()
    noteSettled(2)
    noteSettled(1)
    expect(settingsUnsent()).toBe(false)
  })

  it('are forgotten on reset', () => {
    noteChoice()
    resetUnsent()
    expect(settingsUnsent()).toBe(false)
    expect(choicesSoFar()).toBe(0)
  })
})
