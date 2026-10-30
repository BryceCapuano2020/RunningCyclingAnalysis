import { describe, it, vi } from 'vitest'
import { REGISTRY } from './registry'
import { expectRegistrySilence } from './test/harness'
import { nullLibraries } from './test/plantedLibrary'

vi.setConfig({ testTimeout: 1_800_000 })

/**
 * The app's registry as a whole, on libraries where nothing changes: all its detectors together may speak at most the
 * family budget (FINDINGS.familyBudgetPerYear) of new findings an athlete-year. The detectors' own simulations hold
 * each to its share; this holds the sum, with the nuisances a real library has, so the false findings of a
 * detector added later cannot go unseen because its own bar is strict.
 */
const NOISE = { noise: 0.03, noiseModel: { autocorrelation: 0.9, heavyTails: true } }

describe('the registry as a family', () => {
  it('speaks within the family budget when nothing changes', () => {
    expectRegistrySilence(REGISTRY, nullLibraries({ perCell: 10, ...NOISE }), {
      minAthleteYears: 100,
    })
  })

  it('speaks within the family budget through a season of swing, a strap change and heart-rate spikes', () => {
    expectRegistrySilence(
      REGISTRY,
      nullLibraries({ perCell: 6, nuisances: ['seasonal', 'strap-change', 'hr-spikes'], ...NOISE }),
      { minAthleteYears: 60, perAthleteYear: 0.65 },
    )
  })
})
