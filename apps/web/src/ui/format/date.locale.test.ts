import { describe, expect, it, vi } from 'vitest'
import { formatDay } from './date'

// Its own file, so no formatter is built before this test: the cache starts empty.
describe('the names of days and months', () => {
  it('asks the browser locale for the names, through one helper', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat')
    formatDay(new Date(2026, 5, 3).getTime(), new Date(2026, 5, 10).getTime())
    expect(spy).toHaveBeenCalledWith(undefined, expect.anything())
    spy.mockRestore()
  })
})
