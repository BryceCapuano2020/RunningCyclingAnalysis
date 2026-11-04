import { describe, expect, it } from 'vitest'
import { gradesOfStanding } from '../../../apps/web/src/ui/thresholdGrade'
import { levelTargetText } from '../../../apps/web/src/ui/levelTarget'
import { balanceOfPick } from '../../../apps/web/src/ui/components/balanceScale'
import { fewEffortsText } from '../../../apps/web/src/ui/pages/balanceMissing'
import { heldPick } from '../../../apps/web/src/ui/resultHold'
import { standingOf } from '../../../apps/web/src/ui/standing'
import { threshold } from '../../../apps/web/src/ui/records'
import { thresholdBasisLine } from '../../../apps/web/src/ui/thresholdBasis'
import { thresholdRange } from '../../../apps/web/src/ui/thresholdRange'
import { drift, flat, library, PROFILE, resultOf, SETTINGS, sessionOf } from '../support'
import type { Plan } from '../support'

const YEARS = 6
const SPORTS = ['run', 'ride'] as const
const UNITS = 'metric'
/** A refusal or a hedge in the words a sport's card and the Balance headline print. */
const HEDGE =
  /not enough|too few|too little|limiter|weak|strength|holding you back|ahead of|because|caused|may be|might|approximately|roughly|probably|perhaps|disclaimer|at least|unreliable/i

/** Three athletes with six years on file in both sports: steady, gaining and losing. */
const ATHLETES: Record<string, Plan> = {
  steady: { years: YEARS, everyDays: 14, scale: { run: flat(1), ride: flat(1) } },
  gaining: {
    years: YEARS,
    everyDays: 14,
    scale: { run: drift(0.85, 1, YEARS), ride: drift(0.8, 1, YEARS) },
  },
  losing: {
    years: YEARS,
    everyDays: 14,
    scale: { run: drift(1, 0.85, YEARS), ride: drift(1, 0.8, YEARS) },
  },
}

describe.each(Object.entries(ATHLETES))('a long history of a %s athlete', (_name, plan) => {
  const session = sessionOf(library(plan))

  it.each(['default', 'all', 365] as const)(
    'gets an answer for each sport on the Balance surface, over %s',
    (choice) => {
      const result = resultOf(session, choice)
      const standing = standingOf(result, PROFILE, { massKg: SETTINGS.massKg, units: UNITS })
      const grades = gradesOfStanding(result, standing)
      for (const sport of SPORTS) {
        expect(grades[sport].kind, `${sport} grade`).toBe('graded')
        expect(
          threshold(result, sport, SETTINGS.massKg, UNITS),
          `${sport} threshold`,
        ).not.toBeNull()
      }
      // The headline is not held, so the lede, the meter and the tiles all state the balance.
      const { hold, pick } = heldPick(result)
      expect(hold).toBeNull()
      expect(pick).not.toBeNull()
      expect(balanceOfPick(standing.lead, pick)).not.toBeNull()
      expect(fewEffortsText(result)).toBeNull()
    },
  )

  it('prints no hedge or disclaimer on the cards and the headline', () => {
    const result = resultOf(session, 'all')
    const standing = standingOf(result, PROFILE, { massKg: SETTINGS.massKg, units: UNITS })
    const copy = [
      ...SPORTS.flatMap((sport) => [
        threshold(result, sport, SETTINGS.massKg, UNITS)?.value,
        thresholdBasisLine(result, sport),
        thresholdRange(result, sport, SETTINGS.massKg, UNITS),
      ]),
      levelTargetText(standing.match.run ?? standing.match.ride, UNITS),
    ].filter((line): line is string => typeof line === 'string')
    expect(copy.length).toBeGreaterThanOrEqual(6)
    for (const line of copy) expect(line, line).not.toMatch(HEDGE)
  })
})
