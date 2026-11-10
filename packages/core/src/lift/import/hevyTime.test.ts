import { describe, expect, it } from 'vitest'
import { parseHevyTime } from './hevyTime'

describe('parseHevyTime', () => {
  it.each([
    ['2031-03-02', { date: '2031-03-02' }],
    ['2031-03-02 18:30:00', { date: '2031-03-02', time: '18:30' }],
    ['2031-03-02T07:05:09', { date: '2031-03-02', time: '07:05' }],
    ['2031-03-02T23:59:00.250', { date: '2031-03-02', time: '23:59' }],
    ['2 Mar 2031, 18:30', { date: '2031-03-02', time: '18:30' }],
  ])('reads %s', (text, expected) => {
    expect(parseHevyTime(text)).toEqual(expected)
  })

  it.each([
    '',
    '2031-03-02T07:05:09Z',
    '2031-03-02T07:05:09+01:00',
    '2031-02-30',
    '2031-03-02 12:60',
    '1960-01-01',
  ])('refuses %j', (text) => {
    expect(parseHevyTime(text)).toBeNull()
  })
})
