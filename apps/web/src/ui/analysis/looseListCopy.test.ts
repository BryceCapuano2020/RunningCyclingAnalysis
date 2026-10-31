import { describe, expect, it } from 'vitest'
import { looseListLine } from './looseListCopy'

describe('looseListLine', () => {
  it('says how many of the listed files were in the import, when some were not', () => {
    expect(looseListLine({ listed: { named: 1_204, received: 3 } })).toBe(
      'Your activities.csv lists 1,204 files; 3 were in this import.',
    )
    expect(looseListLine({ listed: { named: 2, received: 1 } })).toBe(
      'Your activities.csv lists 2 files; 1 was in this import.',
    )
  })

  it('says nothing when every listed file was given', () => {
    expect(looseListLine({ listed: { named: 5, received: 5 } })).toBeNull()
  })

  it('says to add the list when files were refused for want of a sport and no list came', () => {
    expect(looseListLine({ needsList: true })).toBe(
      'Add activities.csv from the same export to give these their sport.',
    )
  })

  it('says nothing otherwise', () => {
    expect(looseListLine({})).toBeNull()
  })
})
