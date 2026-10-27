import { expect, it, vi } from 'vitest'
import * as sampling from '../compare/sampling'
import { sampleDataset } from '../synthetic'
import { combine } from './combine'
import { digestActivity } from './digestActivity'

vi.mock('../compare/sampling', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../compare/sampling')>()
  return { ...actual, drawPriors: vi.fn(actual.drawPriors) }
})

it('draws the priors once for the comparison and once for every equivalent', () => {
  const { athlete, activities } = sampleDataset()
  const digests = activities.map((a) => digestActivity(a))
  vi.mocked(sampling.drawPriors).mockClear()
  const { equivalents } = combine(digests, {
    massKg: athlete.massKg,
    bikeMassKg: athlete.bikeMassKg,
  })
  expect(equivalents.length).toBeGreaterThan(1)
  expect(sampling.drawPriors).toHaveBeenCalledTimes(2)
})
