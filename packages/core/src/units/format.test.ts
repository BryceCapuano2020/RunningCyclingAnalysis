import { describe, expect, it } from 'vitest'
import {
  PACE_UNIT,
  formatClock,
  formatTimeOfDay,
  formatDistance,
  formatDuration,
  formatElevation,
  formatMass,
  formatPace,
  formatRecordTime,
  formatPaceValue,
  paceSeconds,
  formatPercent,
  formatPower,
  formatWatts,
  formatSpeed,
  formatWkg,
} from './format'

const DASH = '—'

describe('formatDuration', () => {
  it('shows seconds under a minute', () => {
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(0)).toBe('0 s')
  })

  it('shows minutes and seconds, dropping zero seconds', () => {
    expect(formatDuration(300)).toBe('5 min')
    expect(formatDuration(450)).toBe('7 min 30 s')
    expect(formatDuration(60)).toBe('1 min')
  })

  it('shows hours, minutes and seconds, dropping zero parts', () => {
    expect(formatDuration(3600)).toBe('1 h')
    expect(formatDuration(5400)).toBe('1 h 30 min')
    expect(formatDuration(3630)).toBe('1 h 30 s')
    expect(formatDuration(3905)).toBe('1 h 5 min 5 s')
  })

  it('rounds to whole seconds before splitting', () => {
    expect(formatDuration(44.4)).toBe('44 s')
    expect(formatDuration(44.5)).toBe('45 s')
    expect(formatDuration(59.6)).toBe('1 min')
    expect(formatDuration(7199.6)).toBe('2 h')
  })

  it('prefixes a minus sign for negative durations', () => {
    expect(formatDuration(-45)).toBe('-45 s')
    expect(formatDuration(-0.4)).toBe('0 s')
  })

  it('returns a dash for non-finite input', () => {
    expect(formatDuration(NaN)).toBe(DASH)
    expect(formatDuration(Infinity)).toBe(DASH)
  })
})

describe('formatPace', () => {
  it('formats minutes per mile in imperial', () => {
    expect(formatPace(1609.344 / 435, 'imperial')).toBe('7:15 /mi')
  })

  it('formats minutes per kilometre in metric', () => {
    expect(formatPace(1000 / 270, 'metric')).toBe('4:30 /km')
  })

  it('pads seconds to two digits', () => {
    expect(formatPace(1000 / 65, 'metric')).toBe('1:05 /km')
  })

  it('carries rounded seconds into minutes', () => {
    expect(formatPace(1000 / 359.6, 'metric')).toBe('6:00 /km')
    expect(formatPace(1000 / 359.4, 'metric')).toBe('5:59 /km')
    expect(formatPace(1000 / 419.7, 'metric')).toBe('7:00 /km')
    expect(formatPace(1609.344 / 1199.6, 'imperial')).toBe('20:00 /mi')
  })

  it('returns a dash for zero, negative, NaN or infinite speed', () => {
    expect(formatPace(0, 'metric')).toBe(DASH)
    expect(formatPace(-2, 'imperial')).toBe(DASH)
    expect(formatPace(NaN, 'metric')).toBe(DASH)
    expect(formatPace(Infinity, 'imperial')).toBe(DASH)
  })
})

describe('paceSeconds and formatClock', () => {
  it('gives seconds per kilometre or mile, and clock form rounds the seconds', () => {
    expect(paceSeconds(1000 / 270, 'metric')).toBeCloseTo(270, 9)
    expect(paceSeconds(1609.344 / 435, 'imperial')).toBeCloseTo(435, 9)
    expect(formatClock(269.6)).toBe('4:30')
    expect(formatClock(65)).toBe('1:05')
  })
})

describe('formatPaceValue', () => {
  it('gives minutes and seconds without the unit, for either system', () => {
    expect(formatPaceValue(1609.344 / 435, 'imperial')).toBe('7:15')
    expect(formatPaceValue(1000 / 270, 'metric')).toBe('4:30')
  })

  it('rounds and carries seconds exactly as formatPace does', () => {
    expect(formatPaceValue(1000 / 359.6, 'metric')).toBe('6:00')
    expect(formatPaceValue(1000 / 359.4, 'metric')).toBe('5:59')
    expect(formatPaceValue(1609.344 / 1199.6, 'imperial')).toBe('20:00')
  })

  it('returns a dash for zero, negative, NaN or infinite speed', () => {
    expect(formatPaceValue(0, 'metric')).toBe(DASH)
    expect(formatPaceValue(-2, 'imperial')).toBe(DASH)
    expect(formatPaceValue(NaN, 'metric')).toBe(DASH)
    expect(formatPaceValue(Infinity, 'imperial')).toBe(DASH)
  })

  it('is the number formatPace shows, followed by PACE_UNIT', () => {
    expect(PACE_UNIT).toEqual({ imperial: '/mi', metric: '/km' })
    const speed = 1000 / 277
    expect(formatPace(speed, 'metric')).toBe(`${formatPaceValue(speed, 'metric')} /km`)
    expect(formatPace(speed, 'imperial')).toBe(`${formatPaceValue(speed, 'imperial')} /mi`)
  })
})

describe('formatSpeed', () => {
  it('formats miles per hour in imperial', () => {
    expect(formatSpeed(18.4 * 0.44704, 'imperial')).toBe('18.4 mph')
    expect(formatSpeed(10, 'imperial')).toBe('22.4 mph')
  })

  it('formats kilometres per hour in metric', () => {
    expect(formatSpeed(29.6 / 3.6, 'metric')).toBe('29.6 km/h')
    expect(formatSpeed(10, 'metric')).toBe('36.0 km/h')
    expect(formatSpeed(0, 'metric')).toBe('0.0 km/h')
  })

  it('returns a dash for NaN or infinite speed', () => {
    expect(formatSpeed(NaN, 'imperial')).toBe(DASH)
    expect(formatSpeed(Infinity, 'metric')).toBe(DASH)
  })
})

describe('formatDistance', () => {
  it('formats miles with two decimals in imperial', () => {
    expect(formatDistance(10000, 'imperial')).toBe('6.21 mi')
    expect(formatDistance(1609.344, 'imperial')).toBe('1.00 mi')
  })

  it('formats kilometres with two decimals in metric', () => {
    expect(formatDistance(10000, 'metric')).toBe('10.00 km')
    expect(formatDistance(1500, 'metric')).toBe('1.50 km')
  })

  it('returns a dash for NaN', () => {
    expect(formatDistance(NaN, 'metric')).toBe(DASH)
    expect(formatDistance(NaN, 'imperial')).toBe(DASH)
  })
})

describe('formatElevation', () => {
  it('formats metres as whole numbers', () => {
    expect(formatElevation(381, 'metric')).toBe('381 m')
    expect(formatElevation(0, 'metric')).toBe('0 m')
    expect(formatElevation(999.5, 'metric')).toBe('1,000 m')
  })

  it('groups thousands with commas', () => {
    expect(formatElevation(1000, 'metric')).toBe('1,000 m')
    expect(formatElevation(1234567, 'metric')).toBe('1,234,567 m')
  })

  it('formats feet with grouping in imperial', () => {
    expect(formatElevation(381, 'imperial')).toBe('1,250 ft')
    expect(formatElevation(100, 'imperial')).toBe('328 ft')
  })

  it('keeps a minus sign on negative elevations', () => {
    expect(formatElevation(-12, 'metric')).toBe('-12 m')
    expect(formatElevation(-10, 'imperial')).toBe('-33 ft')
    expect(formatElevation(-0.2, 'metric')).toBe('0 m')
  })

  it('returns a dash for NaN', () => {
    expect(formatElevation(NaN, 'imperial')).toBe(DASH)
  })
})

describe('formatMass', () => {
  it('formats kilograms in metric', () => {
    expect(formatMass(75, 'metric')).toBe('75 kg')
    expect(formatMass(-0.2, 'metric')).toBe('0 kg')
  })

  it('formats pounds in imperial', () => {
    expect(formatMass(75, 'imperial')).toBe('165 lb')
    expect(formatMass(74.8428, 'imperial')).toBe('165 lb')
  })

  it('returns a dash for NaN', () => {
    expect(formatMass(NaN, 'metric')).toBe(DASH)
  })
})

describe('formatPower', () => {
  it('formats watts as a whole number', () => {
    expect(formatPower(285)).toBe('285 W')
    expect(formatPower(284.6)).toBe('285 W')
    expect(formatPower(-0.2)).toBe('0 W')
  })

  it('groups thousands as the other large numbers do', () => {
    expect(formatPower(1200)).toBe('1,200 W')
    expect(formatPower(1446.4)).toBe('1,446 W')
  })

  it('returns a dash for NaN', () => {
    expect(formatPower(NaN)).toBe(DASH)
  })
})

describe('formatWkg', () => {
  it('formats W/kg with one decimal', () => {
    expect(formatWkg(3.8)).toBe('3.8 W/kg')
    expect(formatWkg(3.84)).toBe('3.8 W/kg')
    expect(formatWkg(0)).toBe('0.0 W/kg')
  })

  it('returns a dash for NaN', () => {
    expect(formatWkg(NaN)).toBe(DASH)
  })
})

describe('formatPercent', () => {
  it('formats a fraction as a whole percentage', () => {
    expect(formatPercent(0.083)).toBe('8%')
    expect(formatPercent(1.5)).toBe('150%')
  })

  it('adds a sign when signed', () => {
    expect(formatPercent(0.083, true)).toBe('+8%')
    expect(formatPercent(-0.083, true)).toBe('-8%')
  })

  it('shows zero without a sign', () => {
    expect(formatPercent(0, true)).toBe('0%')
    expect(formatPercent(-0.004, true)).toBe('0%')
    expect(formatPercent(0.004, true)).toBe('0%')
  })

  it('keeps the minus sign when unsigned', () => {
    expect(formatPercent(-0.083)).toBe('-8%')
  })

  it('returns a dash for NaN', () => {
    expect(formatPercent(NaN)).toBe(DASH)
    expect(formatPercent(NaN, true)).toBe(DASH)
  })
})

describe('formatWatts', () => {
  it('rounds to whole watts, without the unit', () => {
    expect(formatWatts(285)).toBe('285')
    expect(formatWatts(284.6)).toBe('285')
  })

  it('is a dash when there is no value', () => {
    expect(formatWatts(NaN)).toBe(DASH)
  })

  it('is the number that formatPower shows before its unit', () => {
    expect(formatPower(284.6)).toBe(`${formatWatts(284.6)} W`)
  })
})

describe('formatRecordTime', () => {
  it('reads minutes and seconds, with no leading zero on the minutes', () => {
    expect(formatRecordTime(250)).toBe('4:10')
    expect(formatRecordTime(402.336)).toBe('6:42')
    expect(formatRecordTime(59.6)).toBe('1:00')
  })

  it('adds hours from an hour, with minutes and seconds always two digits', () => {
    expect(formatRecordTime(3725)).toBe('1:02:05')
    expect(formatRecordTime(3600)).toBe('1:00:00')
  })

  it('shows a dash for a time that is not a number', () => {
    expect(formatRecordTime(NaN)).toBe('—')
  })
})

describe('formatTimeOfDay', () => {
  // Local constructors, so the clock reads the same in every zone the suite runs in.
  const at = (hour: number, minute: number) => new Date(2026, 5, 3, hour, minute).getTime()

  it.each([
    [0, 5, '12:05 am'],
    [6, 11, '6:11 am'],
    [6, 42, '6:42 am'],
    [11, 59, '11:59 am'],
    [12, 0, '12:00 pm'],
    [12, 30, '12:30 pm'],
    [18, 5, '6:05 pm'],
    [23, 59, '11:59 pm'],
  ])('shows %i:%i as %s', (hour, minute, text) => {
    expect(formatTimeOfDay(at(hour, minute))).toBe(text)
  })
})
