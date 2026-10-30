import { describe, it, vi } from 'vitest'
import { DETECTORS } from './detectors'
import { REGISTRY } from './registry'
import { expectRegistrySilence, expectSilence } from './test/harness'
import { nullLibraries } from './test/plantedLibrary'

vi.setConfig({ testTimeout: 1_800_000 })

/**
 * The app's registry on libraries where nothing changes. Each detector may speak at most the share of the family budget
 * it declares (`Detector.alarmBudget`), measured alone; and all of them together at most the family budget
 * (FINDINGS.familyBudgetPerYear) of new findings an athlete-year, so the false findings of a detector added later cannot
 * go unseen because its own bar is strict.
 */
const NOISE = { noise: 0.03, noiseModel: { autocorrelation: 0.9, heavyTails: true } }

describe('each detector against the share it declares', () => {
  for (const detector of DETECTORS) {
    it(`${detector.id} speaks within ${detector.alarmBudget} an athlete-year when nothing changes`, () => {
      expectSilence(detector, nullLibraries({ perCell: 10, ...NOISE }), {
        perAthleteYear: detector.alarmBudget,
        minAthleteYears: 100,
      })
    })
  }
})

describe('the registry as a family', () => {
  it('speaks within the family budget when nothing changes', () => {
    expectRegistrySilence(REGISTRY, nullLibraries({ perCell: 10, ...NOISE }), {
      minAthleteYears: 100,
    })
  })

  // The fitness status documents a season of 3% swing as over its own 0.4 budget (docs/design/fitness.md, known gaps) and
  // its own simulation holds that case to 0.65; a strap change and heart-rate spikes on top of the season stay inside the
  // same documented allowance. This case holds the whole registry to it: it is the known gap, not the budget.
  it('stays within the 0.65 the fitness status documents for a 3% season, with a strap change and spikes on top', () => {
    expectRegistrySilence(
      REGISTRY,
      nullLibraries({ perCell: 6, nuisances: ['seasonal', 'strap-change', 'hr-spikes'], ...NOISE }),
      { minAthleteYears: 60, perAthleteYear: 0.65 },
    )
  })
})
