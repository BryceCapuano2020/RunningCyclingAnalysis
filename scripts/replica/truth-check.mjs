#!/usr/bin/env node
/**
 * Checks a replica run against a JSON file of expected values: the numbers an athlete knows are right
 * about their own account, and the hedge words a card must not carry.
 *
 * PRIVATE DATA. The replica output holds a real account's pages, and a truth file for that account holds
 * its real figures. Keep both outside git and out of pull requests, issues and chat. Only a truth file
 * for a synthetic download may be shared.
 *
 *   node scripts/replica/truth-check.mjs <replica-out> <truth.json>
 *
 *   <replica-out>   the output folder of scripts/replica/replica.mjs.
 *   <truth.json>    the expected values (format below).
 *
 * For each check and period it reads <replica-out>/<page>-<period>.txt, finds the line that starts with the
 * card title, takes the first number followed by the unit within the next 11 lines, and passes when that
 * number is within the tolerance. It also fails a card when a hedge word sits between its title and its
 * number. A clock value such as 5:30 or 1:05:30 reads as seconds. Prints one line per check.
 *
 * It then runs checks that need no truth file on every page written (`runInvariants`): a threshold no slower than
 * the best 60 min on its own page, and Balance's lean agreeing with its run threshold and "Your ride as a run" cards.
 *
 * The search for a card's number stops at the next card, so a card that shows no number cannot borrow the
 * next one's: at a line that starts with another check's card title, and at an all-caps line that follows
 * ordinary text. All-caps lines straight after the title (badges such as ESTIMATED) do not stop it.
 *
 *   {
 *     "hedges": { "words": ["ABOUT", "ROUGHLY"] },
 *     "checks": [
 *       { "id": "run-threshold", "page": "run", "card": "Threshold power", "unit": "W",
 *         "periods": ["default", "all-time"], "expect": 250, "tolerance": 5 }
 *     ]
 *   }
 *
 * Exit codes: 0 every check passes; 1 a check fails or its page file is missing; 2 bad usage or a
 * truth file that is not in this format.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const USAGE = 'usage: node scripts/replica/truth-check.mjs <replica-out> <truth.json>'
/** How many lines after the card title the number may sit. */
const CARD_LINES = 11

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A card's number as a plain value: "1,234.5" is 1234.5, a clock value "5:30" is 330 seconds. */
export function parseNumber(raw) {
  if (raw.includes(':')) {
    const parts = raw.split(':')
    if (parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) return null
    return parts.reduce((seconds, part) => seconds * 60 + Number(part), 0)
  }
  const value = Number(raw.replace(/,/g, ''))
  return Number.isFinite(value) ? value : null
}

/** A line that reads as a card title or badge: it has capitals and no lowercase letters. */
const isCaps = (line) => /[A-Z]/.test(line) && !/[a-z]/.test(line)

/**
 * The card's headline number and the hedge words between its title and that number. Null when no line starts
 * with the title; a null value when the title is there but no number with the unit follows it before the
 * next card begins. `otherCards` are the titles of the other cards being checked.
 */
export function readCard(text, card, unit, hedgeWords = [], otherCards = []) {
  const hedges = hedgeWords.map((word) => word.toUpperCase())
  const title = card.toUpperCase()
  // A title that is a prefix of this one (a check for "Run" beside "Run threshold") is not another card.
  const others = otherCards
    .map((other) => other.toUpperCase())
    .filter((other) => other !== '' && !title.startsWith(other))
  const lines = text.split('\n').map((line) => line.trim())
  const start = lines.findIndex((line) => line.toUpperCase().startsWith(title))
  if (start === -1) return null
  const inlineNumber = new RegExp(`^([\\d.,:]+)\\s*${escapeRegExp(unit)}(?![\\w/])`)
  let sawText = false
  for (let i = start + 1; i < Math.min(lines.length, start + CARD_LINES + 1); i++) {
    const inline = lines[i].match(inlineNumber)
    const split = /^[\d.,:]+$/.test(lines[i]) && lines[i + 1] === unit
    if (inline || split) {
      const value = parseNumber(inline ? inline[1] : lines[i])
      const between = lines.slice(start + 1, i)
      return {
        value,
        hedged: between.filter((line) => hedges.some((word) => line.toUpperCase().includes(word))),
      }
    }
    if (others.some((other) => lines[i].toUpperCase().startsWith(other))) break
    if (!isCaps(lines[i])) sawText = true
    else if (sawText) break
  }
  return { value: null, hedged: [] }
}

/** Throws a message naming the first thing wrong with a truth file; returns the file when it is fine. */
export function validateTruth(truth) {
  if (typeof truth !== 'object' || truth === null || !Array.isArray(truth.checks)) {
    throw new Error('the truth file needs a "checks" list')
  }
  const words = truth.hedges?.words ?? []
  if (!Array.isArray(words) || words.some((word) => typeof word !== 'string' || word === '')) {
    throw new Error('"hedges.words" must be a list of words')
  }
  truth.checks.forEach((check, index) => {
    const where = `check ${index + 1}${typeof check?.id === 'string' ? ` (${check.id})` : ''}`
    for (const key of ['id', 'page', 'card', 'unit']) {
      if (typeof check?.[key] !== 'string' || check[key] === '')
        throw new Error(`${where}: "${key}" must be text`)
    }
    for (const key of ['expect', 'tolerance']) {
      if (!Number.isFinite(check[key]) || (key === 'tolerance' && check[key] < 0)) {
        throw new Error(
          `${where}: "${key}" must be a number${key === 'tolerance' ? ' of 0 or more' : ''}`,
        )
      }
    }
    if (
      !Array.isArray(check.periods) ||
      check.periods.length === 0 ||
      check.periods.some((p) => typeof p !== 'string')
    ) {
      throw new Error(
        `${where}: "periods" must be a list of period names such as "default" or "all-time"`,
      )
    }
  })
  return truth
}

/**
 * Runs every check against the page files in `outdir`. One result per check and period, in file order:
 * { verdict: 'PASS' | 'FAIL' | 'MISSING', line }.
 */
export function runChecks(outdir, truth) {
  const hedgeWords = truth.hedges?.words ?? []
  const cards = truth.checks.map((check) => check.card)
  const results = []
  for (const check of truth.checks) {
    for (const period of check.periods) {
      const file = join(outdir, `${check.page}-${period}.txt`)
      if (!existsSync(file)) {
        results.push({ verdict: 'MISSING', line: `MISSING ${check.id} ${period}: no ${file}` })
        continue
      }
      const text = readFileSync(file, 'utf8')
      const card = readCard(text, check.card, check.unit, hedgeWords, cards)
      const value = card?.value ?? null
      const near = value !== null && Math.abs(value - check.expect) <= check.tolerance
      const verdict = near && card.hedged.length === 0 ? 'PASS' : 'FAIL'
      const hedgeNote = card?.hedged.length ? `, hedged: ${card.hedged.join(' / ')}` : ''
      const found = card === null ? 'no card' : (value ?? 'no number')
      results.push({
        verdict,
        line: `${verdict} ${check.id} ${period}: ${found} ${check.unit}, want ${check.expect} ± ${check.tolerance}${hedgeNote}`,
      })
    }
  }
  return results
}

/** The pace units a page may print, tried in order. */
const PACE_UNITS = ['/mi', '/km']

/** The first number with the unit at the start of `line`, or null. */
function numberAt(line, unit) {
  const match = (line ?? '').match(new RegExp(`^([\\d.,:]+)\\s*${escapeRegExp(unit)}(?![\\w/])`))
  return match ? parseNumber(match[1]) : null
}

/** The current period's best 60 min that a sport page's curve labels ("60 MIN", then "8:05 /mi" or "220 W"). */
export function readBest60(text, unit) {
  const lines = text.split('\n').map((line) => line.trim())
  const at = lines.indexOf('60 MIN')
  return at === -1 ? null : numberAt(lines[at + 1], unit)
}

/** A pace card's value and its unit, in whichever pace unit the page prints. */
function readPace(text, card, otherCards) {
  for (const unit of PACE_UNITS) {
    const read = readCard(text, card, unit, [], otherCards)
    if (read?.value != null) return { value: read.value, unit }
  }
  return null
}

/** Pages are printed to the second and the watt, so a tie within that is not a contradiction. */
const ROUNDING = { pace: 1, power: 0.5 }

/**
 * Checks that need no truth file, on every page the replica wrote: what one page says must not contradict itself.
 * - A threshold is never slower than a sustained effort in its window: a sport page's threshold is at least its best
 *   60 min (a pace no slower, a power no lower). This holds for long windows too, where a recency-weighted estimate
 *   could sit under an hour ridden months ago: the period's threshold may not deny an hour the period holds.
 * - Cards on one page agree on direction: where Balance leans toward running, "Your ride as a run" is slower than the
 *   run threshold, and where it leans toward cycling, faster. These are the two pace cards a reader puts side by side,
 *   so the check reads them as printed, whatever each is computed from: a page whose ride-as-a-run card is a 20 min
 *   equivalent beside a threshold can be right in its own terms and still fail here, and that is the case it is for.
 * A page without the cards a check needs is skipped. One result per check that ran, as `runChecks` gives them.
 */
export function runInvariants(outdir) {
  const results = []
  const pages = existsSync(outdir)
    ? readdirSync(outdir).filter((name) => name.endsWith('.txt'))
    : []
  const record = (pass, id, file, detail) => {
    const verdict = pass ? 'PASS' : 'FAIL'
    results.push({ verdict, line: `${verdict} ${id} ${file.replace(/\.txt$/, '')}: ${detail}` })
  }
  for (const file of pages.sort()) {
    const text = readFileSync(join(outdir, file), 'utf8')
    if (file.startsWith('run-')) {
      const threshold = readPace(text, 'Threshold pace', [])
      const best = threshold && readBest60(text, threshold.unit)
      if (threshold && best != null) {
        const pass = threshold.value <= best + ROUNDING.pace
        record(
          pass,
          'threshold-vs-hour',
          file,
          `threshold ${threshold.value} s, best 60 min ${best} s ${threshold.unit}`,
        )
      }
    } else if (file.startsWith('ride-')) {
      const threshold = readCard(text, 'Threshold power', 'W')?.value ?? null
      const best = readBest60(text, 'W')
      if (threshold != null && best != null) {
        const pass = threshold >= best - ROUNDING.power
        record(pass, 'threshold-vs-hour', file, `threshold ${threshold} W, best 60 min ${best} W`)
      }
    } else if (file.startsWith('balance-')) {
      const lean = text.match(/LEANS TOWARD (RUNNING|CYCLING)/i)?.[1]?.toUpperCase()
      const cards = ['Run threshold', 'Ride threshold', 'Your ride as a run']
      const run = readPace(text, 'Run threshold', cards)
      const ride = run && readCard(text, 'Your ride as a run', run.unit, [], cards)?.value
      if (lean && run && ride != null) {
        const pass =
          lean === 'RUNNING' ? ride >= run.value - ROUNDING.pace : ride <= run.value + ROUNDING.pace
        record(
          pass,
          'lean-vs-cards',
          file,
          `leans ${lean.toLowerCase()}, run threshold ${run.value} s, ride as a run ${ride} s ${run.unit}`,
        )
      }
    }
  }
  return results
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [outdirArg, truthArg, ...extra] = process.argv.slice(2)
  if (outdirArg === undefined || truthArg === undefined || extra.length > 0) {
    console.error(USAGE)
    process.exit(2)
  }
  let truth
  try {
    truth = validateTruth(JSON.parse(readFileSync(resolve(truthArg), 'utf8')))
  } catch (error) {
    // A JSON syntax error quotes the file, which may hold real figures, so only the file's own wording is shown.
    console.error(error instanceof SyntaxError ? `${truthArg} is not valid JSON` : error.message)
    process.exit(2)
  }
  const invariants = runInvariants(resolve(outdirArg))
  const results = [...runChecks(resolve(outdirArg), truth), ...invariants]
  for (const { line } of results) console.log(line)
  // So that "all checks pass" never hides that no page had the cards to check.
  console.log(`${invariants.length} contradiction checks ran`)
  const failed = results.filter(({ verdict }) => verdict !== 'PASS').length
  console.log(failed === 0 ? 'all checks pass' : `${failed} failing`)
  process.exit(failed === 0 ? 0 : 1)
}
