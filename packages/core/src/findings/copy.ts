import { groupThousands } from '../units'
import type { LikelyCause, Method, NumberFact } from './types'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Words findings never use, each as a pattern. A finding states what changed and by how much, not what
 * held the athlete back or what produced it: those are claims the data cannot make.
 * "Grade" is allowed only as an age grade.
 */
const BANNED: { pattern: RegExp; why: string }[] = [
  { pattern: /\blimiter/i, why: 'names a limiter' },
  { pattern: /\blimiting factor/i, why: 'names a limiter' },
  { pattern: /\bweak/i, why: 'calls something weak' },
  { pattern: /\bstrength/i, why: 'calls something a strength' },
  { pattern: /\bholds? you back\b/i, why: 'says what holds the athlete back' },
  { pattern: /\bholding (?:you )?back\b/i, why: 'says what holds the athlete back' },
  { pattern: /\bahead\b/i, why: 'ranks against others or a plan' },
  { pattern: /\bbehind\b/i, why: 'ranks against others or a plan' },
  { pattern: /\boutpac/i, why: 'ranks against others' },
  { pattern: /\bbecause\b/i, why: 'claims a cause' },
  { pattern: /\bcaus(?:e[ds]?|ing|al)\b/i, why: 'claims a cause' },
  { pattern: /\bdue to\b/i, why: 'claims a cause' },
  { pattern: /\bled to\b/i, why: 'claims a cause' },
  { pattern: /\bresult(?:s|ed)? (?:of|from)\b/i, why: 'claims a cause' },
  {
    pattern: /(?<!\bage[ -])\bgrad(?:e[ds]?|ing)\b/i,
    why: 'uses grade for something but an age grade',
  },
]

/** What is wrong with a piece of copy, one entry per banned word found; empty when it is clean. */
export function lintCopy(text: string): string[] {
  return BANNED.filter(({ pattern }) => pattern.test(text)).map(
    ({ pattern, why }) => `"${pattern.exec(text)![0]}" ${why}`,
  )
}

/**
 * Every piece of text a finding shows or carries into its evidence panel, as it would be composed: the
 * headline, the explanation with its prefix, the method line, the names and units of its numbers and the
 * signals behind a cause. A banned word in any of them is as bad as in the headline.
 */
export function copyOf(finding: {
  headline: string
  numbers: readonly NumberFact[]
  method: Method
  likelyCause?: LikelyCause
}): string[] {
  const { headline, numbers, method, likelyCause } = finding
  return [
    headline,
    ...(likelyCause === undefined
      ? []
      : [likelyExplanation(likelyCause.text), ...likelyCause.signals]),
    method.test,
    ...method.exclusions,
    ...numbers.flatMap((n) => [n.key, n.unit]),
  ]
}

/** What is wrong with any of a finding's copy; empty when all is clean. */
export function lintFinding(finding: Parameters<typeof copyOf>[0]): string[] {
  return copyOf(finding).flatMap(lintCopy)
}

/** Throws when copy has a banned word, for the tests of a detector's wording. */
export function assertCleanCopy(text: string): void {
  const problems = lintCopy(text)
  if (problems.length > 0) throw new Error(`Banned wording in "${text}": ${problems.join('; ')}`)
}

/** A count with its noun, pluralised the plain way: "1 run", "14 runs". */
export function counted(n: number, noun: string, plural = `${noun}s`): string {
  return `${groupThousands(String(n))} ${n === 1 ? noun : plural}`
}

/** A whole number of bpm: "148 bpm". */
export function formatBpm(bpm: number): string {
  return `${Math.round(bpm)} bpm`
}

/** A signed size, without a plus: the word for the side carries the direction. "5 bpm", "2.5%". */
export function magnitude(value: number, unit: string, digits = 0): string {
  const text = Math.abs(value).toFixed(digits)
  return unit === '%' ? `${text}%` : `${text} ${unit}`
}

/** A relative change as a percentage: "2.5%" for 0.025, or "3%" at whole numbers. */
export function formatRelative(fraction: number): string {
  const percent = Math.abs(fraction) * 100
  return `${percent < 10 ? Number(percent.toFixed(1)) : Math.round(percent)}%`
}

/** A date as the day and month, such as "21 Oct", read in UTC like the weeks are. */
export function formatDay(ms: number): string {
  const date = new Date(ms)
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`
}

/** Whole weeks between two times, nearest, as "8 weeks". */
export function weeksBetween(fromMs: number, toMs: number): string {
  return counted(Math.round((toMs - fromMs) / (7 * 86_400_000)), 'week')
}

/** The two words a direction is told in; neutral for "neutral". Always sides, never praise or blame. */
export function sideWord(delta: number, words: { up: string; down: string }): string {
  return delta >= 0 ? words.up : words.down
}

/** Prefix for an explanation: the findings that carry one say it is a likely explanation, not proof. */
export function likelyExplanation(text: string): string {
  return `Likely explanation, not proof: ${text}`
}

/** A fact's figure as text, with its interval when it has one: "148", "148 (145 to 151)". Digits are rounded. */
export function factText(fact: NumberFact, digits = 0): string {
  const round = (v: number) => groupThousands(v.toFixed(digits))
  const base = round(fact.value)
  return fact.low === undefined || fact.high === undefined
    ? base
    : `${base} (${round(fact.low)} to ${round(fact.high)})`
}
