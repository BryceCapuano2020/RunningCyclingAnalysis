import { ROAD_STANDARDS_SOURCE } from '@rca/core/grade'

/**
 * The standards behind every grade, named and linked to their repository, with the authors and the
 * licence. Every page that cites the grades uses this, so the citation is written once.
 */
export function StandardsCredit() {
  return (
    <>
      <a href={ROAD_STANDARDS_SOURCE.url}>{ROAD_STANDARDS_SOURCE.name}</a>, by{' '}
      {ROAD_STANDARDS_SOURCE.authors}, licensed {ROAD_STANDARDS_SOURCE.licence}
    </>
  )
}
