import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { Property } from './property'
import { formatCount } from '../format/count'
import { plural } from './plural'
import { NOUNS, SWAPPED_NOTE } from './periodNouns'

export interface PeriodCaptionProps {
  /** The period's dates, such as "12 May – 3 Aug 2025". Empty when there is nothing to date. */
  dates: string
  /** How many of the total are in the period, whether or not the analysis counts them. */
  shown: number
  /** How many are on file. */
  total: number
  /** Of the total, how many the analysis does not count. */
  notCounted: number
  noun: keyof typeof NOUNS
  countHref?: string
  notCountedHref?: string
  /** The range on screen was swapped on Apply. */
  swapped: boolean
  /** The note said in the caption's own line, or null when it has a line of its own or there is none. */
  inlineNote: string | null
  /** The period's name, which the announcement says. */
  choiceLabel?: string
  className: string
}

/** What the caption works out from its props: the count, what is not counted, and the announcement. */
export function captionWords({
  dates,
  shown,
  total,
  notCounted,
  noun,
  swapped,
  inlineNote,
  choiceLabel,
}: PeriodCaptionProps) {
  const [singular, pluralForm] = NOUNS[noun]
  const totalPhrase = plural(total, singular, pluralForm)
  const notCountedText = notCounted > 0 ? `${formatCount(notCounted)} not counted` : ''
  // A period that holds fewer than the total says "42 of 1,200". One that holds them all says the total only to give what is not counted.
  const count =
    shown < total ? `${formatCount(shown)} of ${totalPhrase}` : notCounted > 0 ? totalPhrase : ''
  // Changing the period changes every number on the page, so the choice, the count and the dates are
  // announced. The region stays mounted, so the announcement is made when its text changes.
  const counted =
    total === 0
      ? `No ${pluralForm} to show`
      : shown < total
        ? `Showing ${formatCount(shown)} of ${totalPhrase}`
        : `Showing all ${totalPhrase}`
  const announcement = [counted, notCountedText, choiceLabel, dates, swapped ? SWAPPED_NOTE : '']
    .filter((part) => part !== undefined && part !== '')
    .join(', ')
  const said = dates !== '' || count !== '' || swapped || inlineNote !== null
  return { count, notCountedText, announcement, said }
}

/**
 * Whether the caption's line has anything to say, so a page can leave out the disclosure it would sit in, and whether it
 * gives a count, so the page does not give one too.
 */
export function captionSays(props: PeriodCaptionProps): { said: boolean; counted: boolean } {
  const { said, count } = captionWords(props)
  return { said, counted: count !== '' }
}

/** What a count's row is called, by the noun the page counts. */
const COUNT_LABEL: Record<keyof typeof NOUNS, string> = {
  activity: 'Activities',
  run: 'Runs',
  ride: 'Rides',
}

/**
 * The period as a detail panel's rows (docs/design/system.md, Detail panels): its dates, how many of the total it holds,
 * how many are not counted, each linked where the page gives a link, then the notes on why the window was chosen, each its own
 * row.
 */
export function periodRows(props: PeriodCaptionProps, notes: readonly Property[]): Property[] {
  const { dates, shown, total, notCounted, noun, countHref, notCountedHref, swapped } = props
  const link = (text: string, href: string | undefined): ReactNode =>
    href === undefined ? text : createElement('a', { href }, text)
  return [
    ...(dates === '' ? [] : [{ label: 'Period', value: dates }]),
    ...(total === 0
      ? []
      : [
          {
            label: COUNT_LABEL[noun],
            value: link(
              shown < total ? `${formatCount(shown)} of ${formatCount(total)}` : formatCount(total),
              countHref,
            ),
          },
        ]),
    ...(notCounted > 0
      ? [{ label: 'Not counted', value: link(formatCount(notCounted), notCountedHref) }]
      : []),
    ...(swapped ? [{ label: 'Dates', value: SWAPPED_NOTE }] : []),
    ...notes,
  ]
}
