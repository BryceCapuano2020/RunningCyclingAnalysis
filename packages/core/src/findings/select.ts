import { FINDINGS } from './constants'
import type { Finding } from './types'

/** Highest score first; of equal scores the newer first seen, then the id, so the order never depends on arrival. */
export function byRank(a: Finding, b: Finding): number {
  return (
    b.score - a.score || b.firstSeenMs - a.firstSeenMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

/** One finding of each id, the highest scoring. */
function distinct(findings: readonly Finding[]): Finding[] {
  const best = new Map<string, Finding>()
  for (const finding of findings) {
    const before = best.get(finding.id)
    if (before === undefined || byRank(finding, before) < 0) best.set(finding.id, finding)
  }
  return [...best.values()]
}

/**
 * Efficiency findings of one sport that say the same thing in different ways (the same-heart-rate fit
 * and the flat-pace heart rate) are one finding: the best of them is kept and the rest are named in its
 * corroboratedBy. They say the same thing only if they agree on the direction, so a finding that says
 * the opposite is kept on its own, and the disagreement shows.
 */
function groupEfficiency(findings: readonly Finding[]): Finding[] {
  const kept: Finding[] = []
  const lead = new Map<string, Finding>()
  for (const finding of [...findings].sort(byRank)) {
    const sport = finding.sports.length === 1 ? finding.sports[0]! : null
    if (finding.kind !== 'efficiency' || sport === null) {
      kept.push(finding)
      continue
    }
    const group = `${sport}|${finding.direction}`
    const first = lead.get(group)
    if (first === undefined) {
      const copy = { ...finding, corroboratedBy: [...finding.corroboratedBy] }
      lead.set(group, copy)
      kept.push(copy)
    } else {
      first.corroboratedBy.push(finding.id)
    }
  }
  return kept
}

/**
 * The top of the list holds no kind twice unless the second scores FINDINGS.repeatKindScore or more;
 * findings passed over for that keep their order after the top.
 */
function diversifyTop(ranked: readonly Finding[]): Finding[] {
  const top: Finding[] = []
  const rest: Finding[] = []
  const kinds = new Set<string>()
  for (const finding of ranked) {
    const fits =
      top.length < FINDINGS.topCount &&
      (!kinds.has(finding.kind) || finding.score >= FINDINGS.repeatKindScore)
    if (fits) {
      top.push(finding)
      kinds.add(finding.kind)
    } else {
      rest.push(finding)
    }
  }
  return [...top, ...rest]
}

/** Keeps findings while some sport of theirs has room, FINDINGS.maxPerSport each. */
function capPerSport(ranked: readonly Finding[]): Finding[] {
  const counts = new Map<string, number>()
  const kept: Finding[] = []
  for (const finding of ranked) {
    const room =
      finding.sports.length === 0 ||
      finding.sports.some((s) => (counts.get(s) ?? 0) < FINDINGS.maxPerSport)
    if (!room) continue
    for (const sport of finding.sports) counts.set(sport, (counts.get(sport) ?? 0) + 1)
    kept.push(finding)
  }
  return kept
}

/** Deduplicates, groups same-sport efficiency findings, ranks (score, then newer, then id), spreads kinds over the top three, and caps. */
export function selectFindings(findings: readonly Finding[]): Finding[] {
  return capPerSport(diversifyTop(groupEfficiency(distinct(findings)).sort(byRank)))
}
