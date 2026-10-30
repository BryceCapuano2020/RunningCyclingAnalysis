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

  // One statement of the numbers (docs/design/fitness.md, known gaps): the fitness status budget is 0.2 an athlete-year and
  // the family's 0.5; a 3% season is a known gap over the 0.2, which its own simulation holds to 0.65. This case holds the
  // whole registry, with a strap change and heart-rate spikes on top of the season, to that same 0.65 ceiling: it is the
  // documented ceiling for a nuisance, not a budget.
  it('stays within the 0.65 nuisance ceiling the fitness status documents, for a 3% season with a strap change and spikes on top', () => {
    expectRegistrySilence(
      REGISTRY,
      nullLibraries({ perCell: 6, nuisances: ['seasonal', 'strap-change', 'hr-spikes'], ...NOISE }),
      { minAthleteYears: 60, perAthleteYear: 0.65 },
    )
  })
})
