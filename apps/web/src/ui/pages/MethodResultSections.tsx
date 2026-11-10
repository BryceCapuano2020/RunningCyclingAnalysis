import type { ReactNode } from 'react'
import { ALL_OUT_FRACTION } from '@rca/core/effort'
import { formatPercent } from '@rca/core/units'
import { Definition } from '../components/Definition'
import { NumText } from '../components/NumText'
import { WeightPrompt } from '../components/WeightPrompt'
import { HEADLINE_LABEL } from '../grades'
import { MethodFacts, MethodSection } from './MethodSection'
import {
  ENERGY_CROSS_CHECK,
  ENERGY_FACTS,
  ENERGY_FALLBACK,
  ENERGY_LEAD,
  HEART_FACTS,
  HEART_LEAD,
  VIRTUAL_FACTS,
  VIRTUAL_LEAD,
} from './methodCopy'
import { ENERGY_BRIDGE } from './methodEnergyCopy'

/** What the energy view says of this library: a line on why there is no comparison, or the comparison's range. */
export type EnergyReading =
  | { kind: 'line'; text: string; askWeight?: boolean }
  | { kind: 'range'; gapShown: boolean; facts: readonly string[] }

/** The energy view: the method, then what this library's comparison gives, or why there is none. */
export function EnergySection({ reading }: { reading: EnergyReading }) {
  return (
    <MethodSection section="energy" lead={ENERGY_LEAD} facts={ENERGY_FACTS}>
      {reading.kind === 'line' ? (
        <p className="secondary">
          <NumText text={reading.text} />
          {reading.askWeight === true && (
            <>
              {' '}
              <WeightPrompt />
            </>
          )}
        </p>
      ) : (
        <>
          <p className="secondary">{reading.gapShown ? ENERGY_CROSS_CHECK : ENERGY_FALLBACK}</p>
          <MethodFacts
            facts={[
              ...reading.facts,
              ...(reading.gapShown ? [ENERGY_BRIDGE] : []),
              'The range does not include every source of error.',
            ]}
          />
        </>
      )}
    </MethodSection>
  )
}

/** What a max heart rate is, in a note beside the term. */
const MAX_HEART_RATE_MEANING =
  'The highest heart rate you hold for a sustained effort in each sport.'

/**
 * The heart-rate check: the hard line with its defined term, the method, then what this library's maxima and best
 * efforts were (`facts`).
 */
export function HeartSection({
  facts,
  hardEfforts,
}: {
  facts: readonly string[]
  hardEfforts: boolean
}) {
  return (
    <MethodSection section="heart" lead={HEART_LEAD}>
      <p className="secondary">
        {`A best counts as hard at ${formatPercent(ALL_OUT_FRACTION)} of your `}
        <Definition meaning={MAX_HEART_RATE_MEANING}>max heart rate</Definition>.
      </p>
      <MethodFacts facts={HEART_FACTS} />
      <MethodFacts
        facts={[
          ...facts,
          ...(hardEfforts
            ? [
                `Both best efforts reached at least ${formatPercent(ALL_OUT_FRACTION)} of each sport’s max heart rate.`,
                `Heart rate cannot tell a hard ${HEADLINE_LABEL} from an all-out one.`,
              ]
            : []),
        ]}
      />
    </MethodSection>
  )
}

/** The virtual power meter: the method, then how close its watts came on this library's climbs (`children`). */
export function VirtualPowerSection({ children }: { children?: ReactNode }) {
  return (
    <MethodSection section="accuracy" lead={VIRTUAL_LEAD} facts={VIRTUAL_FACTS}>
      {children}
    </MethodSection>
  )
}
