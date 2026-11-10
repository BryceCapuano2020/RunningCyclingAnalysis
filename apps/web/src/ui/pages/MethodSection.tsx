import type { ReactNode } from 'react'
import { NumText } from '../components/NumText'
import { MethodText } from '../components/MethodText'
import { SECTION_ID } from '../components/methodTopics'
import { SECTION_NAME } from './methodContents'

const NO_FACTS: readonly string[] = []

/** A list of facts, one sentence each, in the method's serif. */
export function MethodFacts({ facts }: { facts: readonly string[] }) {
  if (facts.length === 0) return null
  return (
    <ul className="method__facts">
      {facts.map((fact) => (
        <li key={fact}>
          <NumText text={fact} />
        </li>
      ))}
    </ul>
  )
}

/**
 * One section of Method: its heading, which a link or the contents focuses, the one line a reader wants first, then its
 * facts as a short list. `children` follow the facts: what this library's figures say, or a second list.
 */
export function MethodSection({
  section,
  lead,
  facts = NO_FACTS,
  children,
}: {
  section: keyof typeof SECTION_ID
  lead: string
  facts?: readonly string[]
  children?: ReactNode
}) {
  const id = SECTION_ID[section]
  return (
    <section className="section band" aria-labelledby={id}>
      <h2 id={id} tabIndex={-1}>
        {SECTION_NAME[section]}
      </h2>
      <MethodText>
        <p className="method__lead">
          <NumText text={lead} />
        </p>
        <MethodFacts facts={facts} />
        {children}
      </MethodText>
    </section>
  )
}
