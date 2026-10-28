// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_MEASUREMENTS_PER_USER } from '@rca/contract'
import type { Measurement } from '@rca/core/athlete'
import {
  loadMeasurements,
  parseMeasurements,
  sortedMeasurements,
  storeMeasurements,
} from './measurementStore'

const mass = (value: number, from: string): Measurement => ({ kind: 'massKg', value, from })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseMeasurements', () => {
  it('reads nothing as no settings', () => {
    expect(parseMeasurements(null)).toEqual([])
    expect(parseMeasurements('')).toEqual([])
    expect(parseMeasurements('not json')).toEqual([])
    expect(parseMeasurements('{"items":[]}')).toEqual([])
  })

  it('keeps valid entries earliest first and drops the rest', () => {
    const raw = JSON.stringify([
      mass(80, '2024-06-01'),
      { kind: 'massKg', value: 5, from: '2024-01-01' },
      { kind: 'height', value: 180, from: '2024-01-01' },
      mass(90, '2023-01-01'),
      'junk',
    ])
    expect(parseMeasurements(raw)).toEqual([mass(90, '2023-01-01'), mass(80, '2024-06-01')])
  })

  it('keeps the later of two entries for the same kind, sport and date', () => {
    const raw = JSON.stringify([mass(80, '2024-06-01'), mass(81, '2024-06-01')])
    expect(parseMeasurements(raw)).toEqual([mass(81, '2024-06-01')])
  })

  it('keeps no more than an account may', () => {
    const many = Array.from({ length: MAX_MEASUREMENTS_PER_USER + 5 }, (_, n) =>
      mass(80, new Date(Date.UTC(2000, 0, 1 + n)).toISOString().slice(0, 10)),
    )
    expect(parseMeasurements(JSON.stringify(many))).toHaveLength(MAX_MEASUREMENTS_PER_USER)
  })
})

describe('sortedMeasurements', () => {
  it('orders by date, then by kind and sport', () => {
    const sorted = sortedMeasurements([
      { kind: 'maxHeartRate', sport: 'run', value: 188, from: '2024-01-01' },
      mass(80, '2024-01-01'),
      mass(90, '2023-01-01'),
      { kind: 'maxHeartRate', sport: 'ride', value: 180, from: '2024-01-01' },
    ])
    expect(sorted.map((entry) => [entry.from, entry.kind, entry.sport])).toEqual([
      ['2023-01-01', 'massKg', undefined],
      ['2024-01-01', 'massKg', undefined],
      ['2024-01-01', 'maxHeartRate', 'ride'],
      ['2024-01-01', 'maxHeartRate', 'run'],
    ])
  })
})

describe('storage', () => {
  it('stores and loads the list', () => {
    localStorage.clear()
    expect(storeMeasurements([mass(80, '2024-01-01')])).toBe(true)
    expect(loadMeasurements()).toEqual([mass(80, '2024-01-01')])
  })

  it('reports a browser that refuses the write, and reads none from one that refuses the read', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(storeMeasurements([mass(80, '2024-01-01')])).toBe(false)
    expect(loadMeasurements()).toEqual([])
  })
})
