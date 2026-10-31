import { describe, expect, it } from 'vitest'
import { adoptionText, offerText, removeText } from './adoptionCopy'

describe('the offer of what this browser kept', () => {
  it('names the account, and says what is not added', () => {
    const text = offerText({ adoptable: 12, again: 0, held: 0 }, 'ada@example.com')
    expect(text).toContain('This browser kept 12 activities from before you signed in.')
    expect(text).toContain('Add them to ada@example.com?')
    expect(text).toContain('Routes are not added')
  })

  it('agrees with one', () => {
    expect(offerText({ adoptable: 1, again: 1, held: 1 }, 'a@b.c')).toBe(
      'This browser kept 1 activity from before you signed in. Add it to a@b.c? Routes are not added: each copy leaves this browser once your account has it, and its route goes with it. 1 activity more needs its file added again. 1 activity is in your account already.',
    )
  })

  it('says none can be added when only the rest is kept', () => {
    expect(offerText({ adoptable: 0, again: 2, held: 1 }, 'a@b.c')).toBe(
      'This browser kept 3 activities from before you signed in. None can be added to a@b.c. 2 activities need their files added again. 1 activity is in your account already.',
    )
  })

  it('counts those that need their files and those the account holds', () => {
    const text = offerText({ adoptable: 2, again: 3, held: 4 }, 'a@b.c')
    expect(text).toContain('3 activities more need their files added again.')
    expect(text).toContain('4 activities are in your account already.')
  })
})

describe('how adding them ended', () => {
  it('says what was added', () => {
    expect(adoptionText({ saved: 5, conflicts: 0, failed: 0, again: 0, held: 0 })).toBe(
      'Added 5 activities to your account.',
    )
  })

  it('says what stays in this browser, and why', () => {
    expect(adoptionText({ saved: 1, conflicts: 2, failed: 1, again: 3, held: 1 })).toBe(
      'Added 1 activity to your account. 2 activities already differ in your account and stay in this browser. 1 activity could not be added and stays in this browser. Try again. 3 activities need their files added again. 1 activity was in your account already.',
    )
  })

  it('does not claim anything when nothing happened', () => {
    expect(adoptionText({ saved: 0, conflicts: 0, failed: 0, again: 0, held: 0 })).toBe(
      'Nothing was added.',
    )
  })
})

describe('removing them from this browser', () => {
  it('counts everything the removal takes, and says the account is not changed', () => {
    const text = removeText({ adoptable: 2, again: 1, held: 1 })
    expect(text).toContain('4 activities kept here')
    expect(text).toContain('Your account is not changed.')
  })
})
