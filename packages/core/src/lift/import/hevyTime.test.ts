import { describe, expect, it } from 'vitest'
import { parseHevyTime } from './hevyTime'

describe('parseHevyTime', () => {
  it.each([
    ['2031-03-02', { date: '2031-03-02' }],
    ['2031-03-02 18:30:00', { date: '2031-03-02', time: '18:30' }],
    ['2031-03-02T07:05:09Z', { date: '2031-03-02', time: '07:05' }],
    ['2031-03-02T23:59:00.250+01:00', { date: '2031-03-02', time: '23:59' }],
    ['2 Mar 2031, 18:30', { date: '2031-03-02', time: '18:30' }],
    ['12 Dec 2031, 6:05', { date: '2031-12-12', time: '06:05' }],
    ['5 sep 2031', { date: '2031-09-05' }],
  ])('reads %s', (text, expected) => {
    expect(parseHevyTime(text)).toEqual(expected)
  })

  it.each([
    '',
    '2031-02-30',
    '2031-03-02 24:00',
    '2031-03-02 12:60',
    '3/2/2031',
    '2 Foo 2031',
    '2 March 2031',
    '2 Mar 31',
    '1960-01-01',
    'x2031-03-02',
  ])('refuses %j', (text) => {
    expect(parseHevyTime(text)).toBeNull()
  })
})
