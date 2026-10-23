import { describe, expect, it } from 'vitest'
import {
  ROAD_DISTANCES_M,
  ROAD_STANDARDS_FEMALE,
  ROAD_STANDARDS_MALE,
  ROAD_STANDARDS_SHA256,
} from './roadStandards'

const TABLES = { female: ROAD_STANDARDS_FEMALE, male: ROAD_STANDARDS_MALE }

/** The text the generator hashes: "male", its age lines, "female", its age lines. */
function tableText(male: number[][], female: number[][]): string {
  const lines = (table: number[][]) => table.map((row) => row.join(' '))
  return ['male', ...lines(male), 'female', ...lines(female)].join('\n')
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

describe('road standards data', () => {
  it('lists 22 ascending positive distances', () => {
    expect(ROAD_DISTANCES_M).toHaveLength(22)
    expect(ROAD_DISTANCES_M.every((d) => d > 0)).toBe(true)
    expect(ROAD_DISTANCES_M.slice(1).every((d, i) => d > ROAD_DISTANCES_M[i]!)).toBe(true)
  })

  for (const [sex, table] of Object.entries(TABLES)) {
    it(`holds 96 ages of 22 positive whole seconds for ${sex}`, () => {
      expect(table).toHaveLength(96)
      for (const row of table) {
        expect(row).toHaveLength(22)
        expect(row.every((s) => Number.isInteger(s) && s > 0)).toBe(true)
      }
    })
  }

  it('has exactly one inversion, the male age 5 cells kept as published', () => {
    const inversions: { sex: string; age: number; index: number }[] = []
    for (const [sex, table] of Object.entries(TABLES)) {
      table.forEach((row, ageIndex) => {
        row.forEach((s, i) => {
          if (i > 0 && s < row[i - 1]!) inversions.push({ sex, age: ageIndex + 5, index: i })
        })
      })
    }
    expect(inversions).toEqual([{ sex: 'male', age: 5, index: 8 }])
  })

  it('keeps the male age-5 inversion as published: 7 Mile 3579 s, 12 km 3150 s', () => {
    expect(ROAD_DISTANCES_M[7]).toBe(11265.408)
    expect(ROAD_DISTANCES_M[8]).toBe(12000)
    expect(ROAD_STANDARDS_MALE[0]![7]).toBe(3579)
    expect(ROAD_STANDARDS_MALE[0]![8]).toBe(3150)
  })

  it('keeps the female age-100 10 km cell as published, 12172 s', () => {
    // Age 100 is the last row, row 95.
    expect(ROAD_DISTANCES_M[6]).toBe(10000)
    expect(ROAD_STANDARDS_FEMALE[95]![6]).toBe(12172)
  })

  it('matches the table checksum recorded by the generator', async () => {
    const digest = await sha256Hex(tableText(ROAD_STANDARDS_MALE, ROAD_STANDARDS_FEMALE))
    expect(digest).toBe(ROAD_STANDARDS_SHA256)
  })
})
