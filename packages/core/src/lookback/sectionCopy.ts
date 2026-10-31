import { withinText } from '../fitness/copy'
import { effortName, level, monthYear, SAY } from './copy'
import type { SportLookBack } from './compute'
import type { HindsightEpisode } from './types'

/**
 * The words a sport's "Your years" section is named by: the finding of its years in one line, the way a closed section
 * says what it found. Dated by year, never "now", and nothing a card could contradict: an open slip is said as the year it
 * began, and a quiet stretch only as the stretch it was.
 */

const year = (ms: number) => new Date(ms).getUTCFullYear()
const upper = (text: string) => `${text[0]!.toUpperCase()}${text.slice(1)}`

/** One episode as a headline: "Your pace at 148 bpm slipped in 2021 and came back". */
export function episodeFinding(episode: HindsightEpisode, sport: SportLookBack): string {
  const you = upper(level(sport))
  const when = year(episode.fromMs)
  const say = SAY[sport.sport]
  switch (episode.kind) {
    case 'slip-back':
      return `${you} slipped in ${when} and came back`
    case 'slip-partly-back':
      return `${you} slipped in ${when} and came part of the way back`
    case 'slip-open':
      return episode.toMs === null
        ? `${you} slipped in ${when}`
        : `${you} slipped in ${when} and stayed lower until it fell again`
    case 'improvement':
      return `${you} got ${say.up} in ${when}`
    case 'after-break':
      return `${you} was ${episode.change.value < 0 ? say.down : say.up} after the break in ${when}`
  }
}

/**
 * The section's finding for one sport, or null when its years have nothing to say. The most recent episode that has ended
 * leads (a slip and its return is news); else one still open; else the longest quiet stretch; else the best that has stood
 * longest; a sport too short for its years says what it needs.
 */
export function yearsFinding(sport: SportLookBack): string | null {
  const years = sport.fitness
  if (years.kind === 'too-short') return 'Your years start after a year of steady running'
  if (years.kind === 'ok') {
    const ended = years.episodes.filter((e) => e.toMs !== null)
    const latest = (list: HindsightEpisode[], by: (e: HindsightEpisode) => number) =>
      [...list].sort((a, b) => by(b) - by(a))[0]
    const first =
      latest(ended, (e) => e.toMs!) ?? latest(years.episodes, (e) => e.fromMs) ?? undefined
    if (first !== undefined) return episodeFinding(first, sport)
    const quiet = [...years.quiet].sort((a, b) => b.toMs - b.fromMs - (a.toMs - a.fromMs))[0]
    if (quiet !== undefined) {
      return `From ${monthYear(quiet.fromMs)} to ${monthYear(quiet.toMs)} ${level(sport)} stayed within ${withinText(sport.sport, quiet.within)}`
    }
  }
  const best = [...sport.milestones].sort((a, b) => a.best.atMs - b.best.atMs)[0]
  if (best !== undefined) {
    return `Your best ${effortName(best.effort)} has stood since ${monthYear(best.best.atMs)}`
  }
  return null
}
