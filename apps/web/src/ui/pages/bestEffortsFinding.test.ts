import { describe, expect, it } from 'vitest'
import { makeActivity } from '../components/fixtures'
import type { RecordRow } from '../recordRow'
import type { BestEffortRows } from './bestEffortRows'
import { bestEffortsFinding } from './bestEffortsFinding'

const row = (key: string, grade: RecordRow['grade']): RecordRow => ({
  key,
  label: key,
  value: '1',
  sub: null,
  grade,
  tags: [],
  setDays: null,
  activity: makeActivity({ id: key }),
})

const list = (rows: RecordRow[]): BestEffortRows => ({
  rows,
  distanceCount: 0,
  listNotes: [],
  someEstimated: false,
  partial: false,
})

describe('bestEffortsFinding', () => {
  it('counts the bests, and says they have levels only when some do', () => {
    expect(bestEffortsFinding(list([row('a', 'Local · 67%'), row('b', null)]))).toBe(
      '2 best efforts with their levels, and the activity each was set in',
    )
  })

  it('promises no levels when there are none, as without a year of birth and sex', () => {
    expect(bestEffortsFinding(list([row('a', null), row('b', null)]))).toBe(
      '2 best efforts and the activity each was set in',
    )
  })

  it('says one in the singular', () => {
    expect(bestEffortsFinding(list([row('a', null)]))).toBe(
      '1 best effort and the activity each was set in',
    )
  })

  it('ends without a full stop, as the other rows’ findings do', () => {
    expect(bestEffortsFinding(list([row('a', null)]))).not.toMatch(/\.$/)
  })
})
