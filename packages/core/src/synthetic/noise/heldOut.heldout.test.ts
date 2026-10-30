import { describe, expect, it } from 'vitest'
import { HELD_OUT_CONFIGS, HELD_OUT_CONFIG_NAMES } from './heldOut'
import { buildLibrary } from './library'
import { PERSONAS } from './personas'
import { TUNING_CONFIGS } from './tuningConfigs'

describe('held-out configurations', () => {
  it('are three athletes unlike each other, the personas and the tuning set', () => {
    const others = [...Object.values(PERSONAS), ...Object.values(TUNING_CONFIGS)].map((s) =>
      JSON.stringify(s),
    )
    const held = HELD_OUT_CONFIG_NAMES.map((n) => JSON.stringify(HELD_OUT_CONFIGS[n]))
    expect(new Set(held).size).toBe(3)
    for (const h of held) expect(others).not.toContain(h)
    const athletes = HELD_OUT_CONFIG_NAMES.map((n) => HELD_OUT_CONFIGS[n].athlete)
    const tuned = Object.values(TUNING_CONFIGS).map((c) => c.athlete)
    for (const a of athletes)
      expect(tuned.some((t) => JSON.stringify(t) === JSON.stringify(a))).toBe(false)
  })

  it.each(HELD_OUT_CONFIG_NAMES)('%s makes a library of the sports it plans', (name) => {
    const entries = buildLibrary(HELD_OUT_CONFIGS[name], 1, 6).entries
    const sports = new Set(entries.map((e) => e.activity.sport))
    expect([...sports].sort()).toEqual(Object.keys(HELD_OUT_CONFIGS[name].plans).sort())
  })
})
