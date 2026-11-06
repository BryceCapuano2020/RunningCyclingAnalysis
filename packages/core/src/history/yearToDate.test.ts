import { afterEach, describe, expect, it } from 'vitest'
import { UTC_ZONE, setViewerZone } from '../calendar'
import { historyOf, NO_HISTORY } from './compute'
import { INPUT, runDigest } from './test/digests'

afterEach(() => void setViewerZone(UTC_ZONE))

const at = (nowMs: number) => ({ ...INPUT, nowMs })
const library = () => [runDigest('a', Date.UTC(2020, 5, 1))]

describe('the year the clock is in', () => {
  it('is the local year of today, and none for an empty library', () => {
    const now = Date.UTC(2027, 2, 1, 12)
    expect(historyOf(library(), at(now)).yearToDate.today.year).toBe(2027)
    expect(historyOf([], at(now)).yearToDate).toEqual(NO_HISTORY.yearToDate)
  })

  it('reads the viewer’s zone: late on 31 December UTC is already the new year at UTC+10', () => {
    const now = Date.UTC(2027, 11, 31, 20)
    expect(historyOf(library(), at(now)).yearToDate.today.year).toBe(2027)
    setViewerZone(() => 600)
    expect(historyOf(library(), at(now)).yearToDate.today.year).toBe(2028)
  })
})
