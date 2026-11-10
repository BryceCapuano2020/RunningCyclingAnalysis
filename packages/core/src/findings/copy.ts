import { groupThousands } from '../units'

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

/** A count with its noun, pluralised the plain way: "1 run", "14 runs". */
export function counted(n: number, noun: string, plural = `${noun}s`): string {
  return `${groupThousands(String(n))} ${n === 1 ? noun : plural}`
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
